import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { S3, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { Buffer } from 'buffer';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const dynamoDB = DynamoDBDocument.from(new DynamoDB());
const s3 = new S3();
const TABLE_NAME = process.env.TABLE_NAME;
const STAGING_BUCKET_NAME = process.env.STAGING_BUCKET;

export const handler = async (event) => {
    console.log('Event received:', JSON.stringify(event, null, 2));

    try {
        const dbParams = {
            TableName: TABLE_NAME,
            FilterExpression: 'S3Bucket = :bucket',
            ExpressionAttributeValues: {
                ':bucket': STAGING_BUCKET_NAME
            }
        };

        const result = await dynamoDB.scan(dbParams);
        const images = await Promise.all(result.Items.map(async (item) => {

            try {
                const signedUrl = await getSignedUrl(
                    s3,
                    new GetObjectCommand({
                        Bucket: STAGING_BUCKET_NAME,
                        Key: item.S3Key
                    }),
                    { expiresIn: 3600 } // 1-hour expiry
                );

                console.log({...item, imageUrl: signedUrl});
                return {
                    ...item,
                    imageUrl: signedUrl
                };
            } catch (s3Error) {
                console.error(`Error fetching image URL for ${item.S3Key}:`, s3Error);
                return { ...item, imageUrl: null, error: 'Error fetching image' };
            }
        }));

        return createResponse(200, {
            message: 'Images fetched successfully',
            images: images
        });

    } catch (error) {
        console.error('Error fetching images:', error);
        return createResponse(500, { message: 'Error fetching images', error: error.message });
    }
};

// Function to convert stream to buffer
const streamToBuffer = async (stream) => {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
};

function createResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        headers: {
            'Access-Control-Allow-Origin': '*',
            "Access-Control-Allow-Methods": "OPTIONS, GET",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify(body)
    };
}
