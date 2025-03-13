// src/handlers/health-check.handler.js
exports.handler = async (event) => {
    // This is a simple health check endpoint that returns 200 OK
    // It will be used by Route 53 health checks to determine if the API is healthy

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            status: 'healthy',
            region: process.env.AWS_REGION,
            timestamp: new Date().toISOString()
        })
    };
};