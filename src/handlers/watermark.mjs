import { S3 } from "@aws-sdk/client-s3";
import sharp from "sharp";
import {DynamoDB} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocument} from '@aws-sdk/lib-dynamodb';

const s3 = new S3({ region: process.env.REGION });
const dynamoDB = DynamoDBDocument.from(new DynamoDB());
const PRIMARY_BUCKET = process.env.PRIMARY_BUCKET;
const STAGING_BUCKET = process.env.STAGING_BUCKET;
const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async (event) => {
    console.log("Event received:", JSON.stringify(event, null, 2));

    const { s3Key, userId } = event;

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
        const imageBuffer = await s3Object.Body;


        // Extract username and create watermark text
        const userName = extractUserName(objectKey);
        const uploadDate = new Date().toISOString().split("T")[0];
        const watermarkText = `${userName} - ${uploadDate}`;

        console.log(`Adding watermark: ${watermarkText}`);


        // Get image metadata (width & height)
        const metadata = await sharp(imageBuffer).metadata();
        const { width, height } = metadata;

        // Create a watermark overlay
        const watermark = await sharp({
            text: {
                text: watermarkText,
                font: "sans",
                rgba: true,
                width: Math.floor(width * 0.5),
                height: Math.floor(height * 0.1),
                align: "center",
            },
        })
            .png()
            .toBuffer();

        console.log("Watermark overlay created");

        // Process the image with Sharp (Adding watermark)
        const watermarkedImageBuffer = await sharp(s3Object.Body)
            .composite([{ input: watermark, gravity: "southeast" }]) // Position watermark
            .toFormat("png")
            .toBuffer();


        // Save processed image to primary bucket
        const processedKey = `processed/${objectKey}`;
        await s3.putObject({
            Bucket: PRIMARY_BUCKET,
            Key: processedKey,
            Body: watermarkedImageBuffer,
            ContentType: "image/png",
        });

        const [userId, imageId, imageName] = s3Key.split('/');

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
        await s3
            .deleteObject({ Bucket: STAGING_BUCKET, Key: s3Key });

        console.log(`Successfully processed ${s3Key}`);

        console.log(`Watermarked image saved to ${PRIMARY_BUCKET}/${processedKey}`);
        return createResponse(200, { message: "Watermark added successfully", key: processedKey });

    } catch (error) {
        console.error("Error adding watermark:", error);
        return createResponse(500, { message: "Error adding watermark", error: error.message });
    }
};

// Function to apply watermark using canvas
async function applyWatermark(imageBuffer, watermarkText) {
    const image = await loadImage(imageBuffer);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");

    // Draw original image
    ctx.drawImage(image, 0, 0, image.width, image.height);

    // Watermark settings
    ctx.font = "32px Arial";
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";  // White semi-transparent
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";

    // Position watermark at bottom-left corner
    const padding = 20;
    ctx.fillText(watermarkText, padding, image.height - padding);

    // Convert to buffer
    return canvas.toBuffer("image/jpeg");
}

// Extract username from S3 key
function extractUserName(objectKey) {
    const parts = objectKey.split("/");
    return parts.length > 1 ? parts[0] : "UnknownUser";
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
