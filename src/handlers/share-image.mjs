import { S3, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3();
const BUCKET_NAME = process.env.BUCKET_NAME;

export const handler = async (event) => {
    console.log('Event received:', JSON.stringify(event, null, 2));

    try {
        const body = JSON.parse(event.body || '{}');
        const { s3Key } = body;

        if (!s3Key) {
            return createResponse(400, {
                message: 'Missing required parameter: s3Key'
            });
        }

        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key
        });

        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 10800 }); // 3 hours in seconds

        return createResponse(200, {
            message: 'Shareable link generated successfully',
            url: signedUrl
        });

    } catch (error) {
        console.error('Error generating shareable link:', error);
        return createResponse(500, { message: 'Error generating shareable link', error: error.message });
    }
};

function createResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        headers: {
            'Access-Control-Allow-Origin': '*',
            "Access-Control-Allow-Methods": "OPTIONS, POST",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify(body)
    };
}