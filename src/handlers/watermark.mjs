import { S3 } from "@aws-sdk/client-s3";
import sharp from "sharp";

const s3 = new S3({ region: process.env.REGION });
const PRIMARY_BUCKET = process.env.PRIMARY_BUCKET;

export const handler = async (event) => {
    console.log("Event received:", JSON.stringify(event, null, 2));

    try {
        const record = event.Records[0];
        const bucketName = record.s3.bucket.name;
        const objectKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

        console.log(`Processing image from ${bucketName}/${objectKey}`);

        // Get the image from the staging bucket
        const s3Object = await s3.getObject({ Bucket: bucketName, Key: objectKey });
        const imageBuffer = await s3Object.Body.transformToByteArray();

        // Load image with sharp
        const image = sharp(imageBuffer);
        const metadata = await image.metadata();

        // Extract user name from metadata or filename
        const userName = extractUserName(objectKey); // Define function below
        const uploadDate = new Date().toISOString().split("T")[0];

        // Generate watermark
        const watermarkSVG = `
            <svg width="${metadata.width}" height="100">
                <text x="10" y="50" font-size="30" fill="white" stroke="black" stroke-width="2">
                    ${userName} - ${uploadDate}
                </text>
            </svg>`;

        // Apply watermark
        const watermarkedImage = await image
            .composite([{ input: Buffer.from(watermarkSVG), gravity: "southeast" }])
            .toBuffer();

        // Define new object key for processed image
        const processedKey = `processed/${objectKey}`;

        // Save processed image to primary bucket
        await s3.putObject({
            Bucket: PRIMARY_BUCKET,
            Key: processedKey,
            Body: watermarkedImage,
            ContentType: metadata.format === "jpeg" ? "image/jpeg" : `image/${metadata.format}`
        });

        console.log(`Watermarked image saved to ${PRIMARY_BUCKET}/${processedKey}`);

        return createResponse(200, { message: "Watermark added successfully", key: processedKey });

    } catch (error) {
        console.error("Error adding watermark:", error);
        return createResponse(500, { message: "Error adding watermark", error: error.message });
    }
};

// Extract user name from S3 object key
function extractUserName(objectKey) {
    const parts = objectKey.split("/");
    return parts.length > 1 ? parts[0] : "UnknownUser";
}

// Response helper
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
