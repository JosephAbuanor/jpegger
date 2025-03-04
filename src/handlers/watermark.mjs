import { S3 } from "@aws-sdk/client-s3";
// import Jimp from "jimp";

const s3 = new S3({ region: process.env.REGION });
const PRIMARY_BUCKET = process.env.PRIMARY_BUCKET;

export const handler = async (event) => {
    console.log("Event received:", JSON.stringify(event, null, 2));

    // try {
    //     const record = event.Records[0];
    //     const bucketName = record.s3.bucket.name;
    //     const objectKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    //     console.log(`Processing image from ${bucketName}/${objectKey}`);

    //     // Get the image from S3
    //     const s3Object = await s3.getObject({ Bucket: bucketName, Key: objectKey });
    //     const imageBuffer = await s3Object.Body.transformToByteArray();

    //     // Load image with Jimp
    //     const image = await Jimp.read(imageBuffer);

    //     // Extract user name from filename
    //     const userName = extractUserName(objectKey);
    //     const uploadDate = new Date().toISOString().split("T")[0];

    //     // Add watermark text
    //     const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    //     image.print(font, 10, 10, `${userName} - ${uploadDate}`);

    //     // Convert processed image to buffer
    //     const watermarkedImageBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);

    //     // Save processed image to primary bucket
    //     const processedKey = `processed/${objectKey}`;
    //     await s3.putObject({
    //         Bucket: PRIMARY_BUCKET,
    //         Key: processedKey,
    //         Body: watermarkedImageBuffer,
    //         ContentType: "image/jpeg",
    //     });

    //     console.log(`Watermarked image saved to ${PRIMARY_BUCKET}/${processedKey}`);
    //     return createResponse(200, { message: "Watermark added successfully", key: processedKey });

    // } catch (error) {
    //     console.error("Error adding watermark:", error);
    //     return createResponse(500, { message: "Error adding watermark", error: error.message });
    // }
};

function extractUserName(objectKey) {
    const parts = objectKey.split("/");
    return parts.length > 1 ? parts[0] : "UnknownUser";
}

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
