import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { S3 } from '@aws-sdk/client-s3';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const s3 = new S3();
const dynamoDB = DynamoDBDocument.from(new DynamoDB());
const STAGING_BUCKET_NAME = process.env.STAGING_BUCKET;
const TABLE_NAME = process.env.TABLE_NAME;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB in bytes

export const handler = async (event) => {
    console.log('Event received:', JSON.stringify(event, null, 2));

    try {
        const body = JSON.parse(event.body || '{}');
        const { image, userId, contentType, filename } = body;

        if (!image || !userId || !contentType) {
            return createResponse(400, {
                message: 'Missing required parameters: image, userId, and contentType are required'
            });
        }

        let imageBuffer;
        try {
            imageBuffer = Buffer.from(
                image.replace(/^data:image\/\w+;base64,/, ''),
                'base64'
            );
        } catch (error) {
            return createResponse(400, { message: 'Invalid image data' });
        }

        // 🔴 Reject images larger than 5MB
        if (imageBuffer.length > MAX_IMAGE_SIZE) {
            return createResponse(400, { message: `Image too large. Max size allowed is ${MAX_IMAGE_SIZE / (1024 * 1024)}MB` });
        }

        const imageId = uuidv4();
        const imageName = filename || `${imageId}.${getExtensionFromContentType(contentType)}`;
        const bucketName = STAGING_BUCKET_NAME;

        const s3Params = {
            Bucket: bucketName,
            Key: `${userId}/${imageId}/${imageName}`,
            Body: imageBuffer,
            ContentType: contentType,
            Metadata: {
                userId: userId,
                imageId: imageId,
                uploadDate: new Date().toISOString(),
            }
        };

        const s3Result = await s3.putObject(s3Params);

        const dbParams = {
            TableName: TABLE_NAME,
            Item: {
                UserId: userId,
                ImageId: imageId,
                Filename: imageName,
                ContentType: contentType,
                S3Key: `${userId}/${imageId}/${imageName}`,
                S3Bucket: bucketName,
                ETag: s3Result.ETag,
                CreatedAt: new Date().toISOString(),
                Size: imageBuffer.length
            }
        };

        await dynamoDB.put(dbParams);

        return createResponse(200, {
            message: 'Image uploaded successfully',
            imageId: imageId,
            location: `s3://${bucketName}/${userId}/${imageId}/${imageName}`
        });

    } catch (error) {
        console.error('Error uploading image:', error);
        return createResponse(500, { message: 'Error uploading image', error: error.message });
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

function getExtensionFromContentType(contentType) {
    const mapping = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/bmp': 'bmp',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'image/tiff': 'tiff'
    };

    return mapping[contentType] || 'jpg';
}