# Photo Blog App

This project is a Photo Blog App where users can create an account, log in to upload, view, delete, and share their pictures with other non-account users.

## Technical Requirements

- **Frontend**: Hosted using AWS Amplify served with AWS CloudFront.
- **Backend**: Fully serverless and provisioned with AWS SAM using AWS SAM Pipeline + GitHub Actions (DEV & PROD Environments).
- **User Authentication**: User signup and sign-in using Amazon Cognito.
- **Image Upload and Processing**:
    - Images are first staged in an S3 bucket.
    - Images are processed to contain a watermark of the user's full name and date of upload.
    - Processed images are stored in a primary S3 bucket.
    - URLs of processed images are stored in a DynamoDB table with appropriate user identifiable attributes.
    - If an upload exceeds API Gateway limits, implement a mechanism using S3 & DynamoDB to allow flow of execution or limit image size to below API Gateway limits.
    - Original unprocessed images are deleted from the staging bucket after successful processing.
    - Failed image processing attempts are retried after 5 minutes, with a maximum of 2 retries. Users are notified of failures via email.
- **Access Control**:
    - Processed images are only accessible to authenticated/registered users unless a user generates and shares a link.
    - Use native S3 & Lambda features for access control.
- **Decoupling**: Use native message queuing services to decouple processes where appropriate.

## Functional Requirements

- Users can sign up to create their own blog space to upload, modify, view, or delete images.
- Users are alerted via email immediately after logging into their account.
- Users can upload, view, or delete their images.
- Only processed (watermarked) images are displayed to users.
- Users can generate a time-bound link (expires in 3 hours) to share an image with non-account users.
- **Recycling Bin Feature**:
    - Deleted images are moved to a recycling bin and can be restored until permanently deleted.
    - Images in the recycling bin are viewable but not shareable.
    - If an image has been deleted since being shared, it is not viewable by persons with the shared link.

## Disaster Recovery Requirements

- **RPO/RTO**: 10 minutes (Warm Standby Disaster Recovery solution).
- **Automated Deployment**: All backend resources (API Gateways, Lambda functions, queues, DynamoDB tables, etc.) are deployed in a secondary disaster recovery region using native AWS services and features.
- **Resource Synchronization**:
    - All resources provisioned by SAM for the primary region must be running idly in the disaster recovery region.
    - Processed user images in the primary bucket must be continuously backed up to a secondary bucket in the disaster recovery region.
    - DynamoDB tables must be replicated in the disaster recovery region using native DynamoDB features.
- **Backend API Failover Mechanism**:
    - Use AWS Route 53, CloudWatch Alarm, and Lambda Function to switch incoming frontend traffic from the primary API Gateway to a secondary API Gateway in a different AWS region when a disaster occurs.
    - Inform the system administrator when the primary API Gateway goes down and after a successful failover to the secondary API.
    - Ensure the Amplify frontend does not lose contact with the backend API Gateway for more than 10 minutes.

## Deployment

To deploy the application, follow these steps:

1. **Build and Deploy**:
   ```bash
   sam build
   sam deploy --guided

2. **Set Up CI/CD**:
    - Configure AWS SAM Pipeline and GitHub Actions for continuous integration and deployment in both DEV and PROD environments.

## Resources

- [AWS SAM Developer Guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html)
- [AWS Amplify Documentation](https://docs.aws.amazon.com/amplify/latest/userguide/welcome.html)
- [AWS CloudFront Documentation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html)
- [Amazon Cognito Documentation](https://docs.aws.amazon.com/cognito/latest/developerguide/what-is-amazon-cognito.html)
- [AWS S3 Documentation](https://docs.aws.amazon.com/AmazonS3/latest/dev/Welcome.html)
- [AWS DynamoDB Documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html)
- [AWS Route 53 Documentation](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/Welcome.html)
- [AWS CloudWatch Documentation](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/latest/dg/welcome.html)
- [AWS SNS Documentation](https://docs.aws.amazon.com/sns/latest/dg/welcome.html)

## License

This project is licensed under the MIT License - see the LICENSE file for details.