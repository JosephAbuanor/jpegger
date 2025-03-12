import {S3} from '@aws-sdk/client-s3';
import {DynamoDBDocument} from '@aws-sdk/lib-dynamodb';
import {DynamoDB} from '@aws-sdk/client-dynamodb';

const s3 = new S3();
const dynamoDB = DynamoDBDocument.from(new DynamoDB());
const BUCKET_NAME = process.env.BUCKET_NAME;
const BUCKET_BIN = process.env.BUCKET_BIN;
const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async (event) => {
    console.log('Event received:', JSON.stringify(event, null, 2));

    try {
        const body = JSON.parse(event.body || '{}');
        const {imageId, s3Key, userId} = body;

        if (!imageId && !s3Key) {
            return createResponse(400, {
                message: 'Missing required parameters: imageId or s3Key is required'
            });
        }

        const key = s3Key || `${imageId}`;
// todo: switch to primary bucket
        // Copy the image to the staging bucket
        await s3.copyObject({
            CopySource: `${BUCKET_BIN}/${key}`,
            Bucket: BUCKET_NAME,
            Key: key
        });

        // Delete the image from the bin bucket
        await s3.deleteObject({
            Bucket: BUCKET_BIN,
            Key: key
        });

        // Update the bucket name in DynamoDB
        await dynamoDB.update({
            TableName: TABLE_NAME,
            Key: {
                ImageId: imageId,
                UserId: userId,
            },
            UpdateExpression: 'set S3Bucket = :bucket',
            ExpressionAttributeValues: {
                ':bucket': BUCKET_NAME
            }
        });

        return createResponse(200, {
            message: 'Image restored successfully',
            key: key
        });

    } catch (error) {
        console.error('Error moving image:', error);
        return createResponse(500, {message: 'Error moving image', error: error.message});
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