import { S3 } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';

const s3 = new S3({ region: process.env.REGION });
const dynamoDB = DynamoDBDocument.from(new DynamoDB());
const PRIMARY_BUCKET = process.env.PRIMARY_BUCKET;
const STAGING_BUCKET = process.env.STAGING_BUCKET;
const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async (event) => {
    console.log("Event received:", JSON.stringify(event, null, 2));

    const { s3Key, userId, userName } = event;

    if (!s3Key || !userId) {
        console.error("Invalid event structure. S3Key or UserId missing");
        return createResponse(400, { message: "Invalid event structure. S3Key or UserId missing" });
    }

    try {
        const bucketName = STAGING_BUCKET;
        const objectKey = decodeURIComponent(s3Key.replace(/\+/g, " "));

        console.log(`Processing image from ${bucketName}/${objectKey}`);

        // Get the image from S3
        const s3Object = await s3.getObject({ Bucket: bucketName, Key: objectKey });
        const imageBuffer = await streamToBuffer(s3Object.Body);

        // Parse the S3 key to extract components
        const keyParts = objectKey.split('/');
        const imageId = keyParts[1];
        const imageName = keyParts[2];

        const uploadDate = new Date().toISOString().split("T")[0];
        const watermarkText = `${userName} - ${uploadDate}`;

        console.log(`Adding watermark: ${watermarkText}`);

        // Get image metadata
        const metadata = await sharp(imageBuffer).metadata();
        const { width, height } = metadata;

        // Create SVG watermark with text
        const svgBuffer = Buffer.from(`
            <svg width="${Math.floor(width * 0.5)}" height="${Math.floor(height * 0.1)}">
                <text 
                    x="50%" 
                    y="50%" 
                    font-family="Arial" 
                    font-size="24" 
                    fill="rgba(255, 255, 255, 0.8)" 
                    text-anchor="middle" 
                    dominant-baseline="middle">${watermarkText}</text>
            </svg>
        `);

        console.log("SVG watermark created");

        // Apply watermark to image
        const watermarkedImageBuffer = await sharp(imageBuffer)
            .composite([{
                input: svgBuffer,
                gravity: 'southeast'
            }])
            .toFormat("png")
            .toBuffer();

        console.log("Watermark applied");

        // Save processed image to primary bucket
        const processedKey = `${objectKey}`;
        await s3.putObject({
            Bucket: PRIMARY_BUCKET,
            Key: processedKey,
            Body: watermarkedImageBuffer,
            ContentType: "image/png",
        });

        console.log(`Image processed and saved to ${PRIMARY_BUCKET}/${processedKey}`);

        // Save metadata in DynamoDB
        await dynamoDB.put({
            TableName: TABLE_NAME,
            Item: {
                UserId: userId,
                ImageId: imageId,
                Filename: imageName,
                ContentType: "image/png",
                S3Key: s3Key,
                S3Bucket: PRIMARY_BUCKET,
                ProcessedUrl: `https://${PRIMARY_BUCKET}.s3.amazonaws.com/${processedKey}`,
                CreatedAt: uploadDate,
                Size: imageBuffer.length
            }
        });

        // Delete original image from Staging bucket
        await s3.deleteObject({ Bucket: STAGING_BUCKET, Key: objectKey });

        console.log(`Successfully processed ${s3Key}`);
        console.log(`Watermarked image saved to ${PRIMARY_BUCKET}/${processedKey}`);

        return createResponse(200, { message: "Watermark added successfully", key: processedKey });

    } catch (error) {
        console.error("Error adding watermark:", error);
        return createResponse(500, { message: "Error adding watermark", error: error.message });
    }
};

// Helper function to convert stream to buffer
async function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

// Create API response
function createResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS, GET, POST",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify(body),
    };
}