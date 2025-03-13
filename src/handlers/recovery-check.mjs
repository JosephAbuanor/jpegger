// src/handlers/recovery-check.handler.js
import AWS from 'aws-sdk';
import https from 'https';

exports.handler = async (event) => {
    // Environment variables
    const hostedZoneId = process.env.HOSTED_ZONE_ID;
    const domainName = process.env.DOMAIN_NAME;
    const primaryRegion = process.env.PRIMARY_REGION;
    const drRegion = process.env.DR_REGION;
    const snsTopicArn = process.env.SNS_TOPIC_ARN;

    // Initialize AWS clients
    const route53 = new AWS.Route53();
    const sns = new AWS.SNS();

    try {
        // Check if primary region API is healthy
        const primaryHealthy = await checkEndpointHealth(`https://api.${domainName}/Prod/health`);

        if (!primaryHealthy) {
            console.log('Primary region is still unhealthy, maintaining failover to DR region');
            return { status: 'primary-unhealthy' };
        }

        // Get current record sets
        const currentRecords = await route53.listResourceRecordSets({
            HostedZoneId: hostedZoneId,
            StartRecordName: `api.${domainName}`,
            StartRecordType: 'A',
            MaxItems: '10'
        }).promise();

        // Find the primary and DR record sets
        const primaryRecord = currentRecords.ResourceRecordSets.find(
            record => record.SetIdentifier && record.SetIdentifier.includes('primary')
        );

        const drRecord = currentRecords.ResourceRecordSets.find(
            record => record.SetIdentifier && record.SetIdentifier.includes('dr')
        );

        if (!primaryRecord || !drRecord) {
            throw new Error('Could not find primary or DR record sets');
        }

        // Check if we need to failback (if DR is currently active)
        if (primaryRecord.Weight === 0 && drRecord.Weight === 100) {
            console.log('Primary region is healthy, initiating failback');

            // Update record weights to restore primary region
            const changes = [
                {
                    Action: 'UPSERT',
                    ResourceRecordSet: {
                        ...primaryRecord,
                        Weight: 100
                    }
                },
                {
                    Action: 'UPSERT',
                    ResourceRecordSet: {
                        ...drRecord,
                        Weight: 0
                    }
                }
            ];

            // Apply changes
            const changeResponse = await route53.changeResourceRecordSets({
                HostedZoneId: hostedZoneId,
                ChangeBatch: {
                    Comment: 'Restoring traffic to primary region',
                    Changes: changes
                }
            }).promise();

            // Notify admin
            await sns.publish({
                TopicArn: snsTopicArn,
                Subject: 'API Failback Completed',
                Message: `Traffic has been restored to the primary region (${primaryRegion}). The system has recovered from the disaster recovery mode.`
            }).promise();

            return {
                status: 'failback-initiated',
                changeId: changeResponse.ChangeInfo.Id
            };
        }

        return { status: 'normal-operation' };

    } catch (error) {
        console.error('Error in recovery check:', error);
        return {
            status: 'error',
            message: error.message
        };
    }
};

// Helper function to check if an endpoint is healthy
async function checkEndpointHealth(url) {
    return new Promise((resolve) => {
        https.get(url, (response) => {
            if (response.statusCode === 200) {
                let data = '';
                response.on('data', (chunk) => {
                    data += chunk;
                });
                response.on('end', () => {
                    try {
                        const responseData = JSON.parse(data);
                        resolve(responseData.status === 'healthy');
                    } catch (e) {
                        resolve(false);
                    }
                });
            } else {
                resolve(false);
            }
        }).on('error', () => {
            resolve(false);
        }).setTimeout(5000, () => {
            resolve(false);
        });
    });
}