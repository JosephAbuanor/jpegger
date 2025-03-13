// src/handlers/failover.js
import AWS from 'aws-sdk';

exports.handler = async (event, context) => {
    console.log('Received event:', JSON.stringify(event, null, 2));

    // Parse the SNS message
    const message = event.Records[0].Sns.Message;
    console.log('Message received from SNS:', message);

    // Environment variables
    const hostedZoneId = process.env.HOSTED_ZONE_ID;
    const domainName = process.env.DOMAIN_NAME;
    const primaryRegion = process.env.PRIMARY_REGION;
    const drRegion = process.env.DR_REGION;

    // Initialize Route53 client
    const route53 = new AWS.Route53();

    try {
        // Get current record sets
        const currentRecords = await route53.listResourceRecordSets({
            HostedZoneId: hostedZoneId,
            StartRecordName: `api.${domainName}`,
            StartRecordType: 'A',
            MaxItems: '10'
        }).promise();

        console.log('Current record sets:', JSON.stringify(currentRecords, null, 2));

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

        // Check if we need to failover (if primary is already inactive, we don't need to do anything)
        if (primaryRecord.Weight > 0) {
            console.log('Primary region is active, initiating failover');

            // Update record weights to redirect traffic to DR region
            const changes = [
                {
                    Action: 'UPSERT',
                    ResourceRecordSet: {
                        ...primaryRecord,
                        Weight: 0
                    }
                },
                {
                    Action: 'UPSERT',
                    ResourceRecordSet: {
                        ...drRecord,
                        Weight: 100
                    }
                }
            ];

            // Apply changes
            const changeResponse = await route53.changeResourceRecordSets({
                HostedZoneId: hostedZoneId,
                ChangeBatch: {
                    Comment: 'Failing over to DR region',
                    Changes: changes
                }
            }).promise();

            console.log('Route53 change response:', JSON.stringify(changeResponse, null, 2));

            // Create an SNS client configured for the DR region to notify about successful failover
            const sns = new AWS.SNS({ region: drRegion });

            // Notify about successful failover
            await sns.publish({
                TopicArn: process.env.SNS_TOPIC_ARN,
                Subject: 'API Failover Completed',
                Message: `Traffic has been redirected from the primary region (${primaryRegion}) to the disaster recovery region (${drRegion}) due to a health check failure.`
            }).promise();

            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'Failover initiated successfully',
                    changeId: changeResponse.ChangeInfo.Id
                })
            };
        } else {
            console.log('Primary region is already inactive, no failover needed');
            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'No failover needed, primary region is already inactive'
                })
            };
        }

    } catch (error) {
        console.error('Error during failover:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error during failover',
                error: error.message
            })
        };
    }
};