import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { S3 } from '@aws-sdk/client-s3';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { Readable } from 'stream';
import { Buffer } from 'buffer';

const dynamoDB = DynamoDBDocument.from(new DynamoDB());
const s3 = new S3();
const TABLE_NAME = process.env.TABLE_NAME;
const STAGING_BUCKET_NAME = process.env.STAGING_BUCKET;

export const handler = async (event) => {
    console.log('Event received:', JSON.stringify(event, null, 2));

    try {
        const dbParams = {
            TableName: TABLE_NAME,
        };

        const result = await dynamoDB.scan(dbParams);
        const images = await Promise.all(result.Items.map(async (item) => {
            const s3Params = {
                Bucket: STAGING_BUCKET_NAME,
                Key: item.S3Key,
            };
            const s3Object = await s3.getObject(s3Params);

            // Convert stream to Buffer
            const imageBuffer = await streamToBuffer(s3Object.Body);
            const imageBase64 = imageBuffer.toString('base64');

            return {
                ...item,
                image: `data:${item.ContentType};base64,${imageBase64}`
            };
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
