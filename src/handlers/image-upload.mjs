import { DynamoDB } from '@aws-sdk/client-dynamodb';
import {S3} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

const s3 = new S3();
const dynamoDB = new DynamoDB.DocumentClient();
const STAGING_BUCKET_NAME = process.env.STAGING_BUCKET;

/**
 * Lambda function to handle image uploads to the primary bucket
 * Processes the incoming image data, stores it in the primary bucket,
 * and adds an entry to the DynamoDB Images table
 */
export const handler = async (event) => {
    console.log('Event received:', JSON.stringify(event, null, 2));

    try {
        // Parse the request body
        const body = JSON.parse(event.body || '{}');
        const { image, userId, contentType, filename } = body;

        if (!image || !userId || !contentType) {
            return createResponse(400, {
                message: 'Missing required parameters: image, userId, and contentType are required'
            });
        }

        // Decode the base64 image
        let imageBuffer;
        try {
            imageBuffer = Buffer.from(
                image.replace(/^data:image\/\w+;base64,/, ''),
                'base64'
            );
        } catch (error) {
            return createResponse(400, { message: 'Invalid image data' });
        }

        // Generate a unique image ID
        const imageId = uuidv4();
        const imageName = filename || `${imageId}.${getExtensionFromContentType(contentType)}`;

        const bucketName = STAGING_BUCKET_NAME;

        // Upload to S3
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

        const s3Result = await s3.putObject(s3Params).promise();

        // Save metadata to DynamoDB
        const dbParams = {
            TableName: 'Images',
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

        await dynamoDB.put(dbParams).promise();

        // Return the success response
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

/**
 * Helper function to create a standardized API response
 */
function createResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        headers: {
            'Access-Control-Allow-Origin': '*', // For CORS support
            "Access-Control-Allow-Methods": "OPTIONS, POST",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify(body)
    };
}

/**
 * Helper function to get file extension from content type
 */
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