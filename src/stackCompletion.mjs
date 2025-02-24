import {
    CognitoIdentityProviderClient,
    AdminGetUserCommand,
    AdminCreateUserCommand,
    AdminAddUserToGroupCommand,
    UpdateUserPoolCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { SNSClient, SubscribeCommand } from '@aws-sdk/client-sns';

const cognitoClient = new CognitoIdentityProviderClient();
const snsClient = new SNSClient();

export const handler = async (event, context) => {
    const responseUrl = event.ResponseURL;
    let status = 'SUCCESS';
    const responseData = {};

    try {
        if (event.RequestType === 'Delete') {
            await sendResponse(responseUrl, event, context, status, responseData);
            return;
        }

        const userPoolId = event.ResourceProperties.UserPoolId;

        await addInviteMessageTemplate(event, userPoolId, responseData, context);
        await createAdminUser(event, userPoolId, responseData, context);

    } catch (error) {
        status = 'FAILED';
        console.error('Error:', error);
        responseData.Error = error.message;
    } finally {
        console.log("----------------------SENDING RESPONSE TO CLOUDFORMATION-------------------")
        await sendResponse(responseUrl, event, context, status, responseData);
    }
};

const createAdminUser = async (event, userPoolId, responseData, context) => {
    const adminEmail = event.ResourceProperties.AdminEmail;
    const adminGroup = event.ResourceProperties.AdminGroup;
    const closedTaskTopicArn = event.ResourceProperties.ClosedTaskTopicArn;
    const taskCompleteTopicArn = event.ResourceProperties.TaskCompleteTopicArn;

    if (adminEmail && adminEmail.trim() !== 'None') {
        try {
            await cognitoClient.send(new AdminGetUserCommand({
                UserPoolId: userPoolId,
                Username: adminEmail,
            }));

            console.log(`User already exists: ${adminEmail}`);
            responseData.Message = `User already exists: ${adminEmail}`;
        } catch (error) {
            if (error.name === 'UserNotFoundException') {
                const userAttributes = [
                    { Name: 'email', Value: adminEmail },
                    { Name: 'email_verified', Value: 'true' },
                ];

                const temporaryPassword = generateTemporaryPassword(16);

                await cognitoClient.send(new AdminCreateUserCommand({
                    UserPoolId: userPoolId,
                    Username: adminEmail,
                    UserAttributes: userAttributes,
                    TemporaryPassword: temporaryPassword,
                    DesiredDeliveryMediums: ['EMAIL'],
                }));

                await cognitoClient.send(new AdminAddUserToGroupCommand({
                    UserPoolId: userPoolId,
                    Username: adminEmail,
                    GroupName: adminGroup,
                }));

                await subscribeToTopic(closedTaskTopicArn, adminEmail);
                await subscribeToTopic(taskCompleteTopicArn, adminEmail);

                console.log('Admin created successfully');
                responseData.Message = 'Admin created successfully';
            } else {
                throw error;
            }
        }
    }
};

const subscribeToTopic = async (topicArn, endpoint) => {
    await snsClient.send(new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: 'email',
        Endpoint: endpoint,
    }));
};

const addInviteMessageTemplate = async (event, userPoolId, responseData, context) => {
    const domain = event.ResourceProperties.UserPoolDomain;
    const clientId = event.ResourceProperties.UserPoolClient;
    const appURL = event.ResourceProperties.ProdFrontendUrl;
    const region = event.ResourceProperties.Region;

    const emailMessage = `Hello {username}!

Your temporary password is {####}

Click here to sign in:
https://${domain}.auth.${region}.amazoncognito.com/login?client_id=${clientId}&response_type=code&redirect_uri=${appURL}

You would have received another mail to subscribe to the SNS topics`;

    await cognitoClient.send(new UpdateUserPoolCommand({
        UserPoolId: userPoolId,
        AdminCreateUserConfig: {
            AllowAdminCreateUserOnly: true,
            InviteMessageTemplate: {
                EmailMessage: emailMessage,
                EmailSubject: 'Welcome to TMS',
            },
        },
    }));

    console.log('UserPool updated successfully');
    responseData.Message = 'UserPool updated successfully';
};

const sendResponse = async (url, event, context, status, data) => {
    const responseBody = JSON.stringify({
        Status: status,
        Reason: `See the details in CloudWatch Log Stream: ${context.logStreamName}`,
        PhysicalResourceId: event.PhysicalResourceId || context.logStreamName,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        Data: data,
    });

    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': '',
                'Content-Length': responseBody.length,
            },
            body: responseBody
        });
        if (!response.ok) {
            console.error(`Failed to send response to CloudFormation: ${response.statusText}`);
        }
        console.log(`Status code: ${response.status}`);
    } catch (e) {
        console.error('Failed to send response to CloudFormation with error: ', e);
    }
};

const generateTemporaryPassword = (length) => {
    return generatePassword(length);
};

function generatePassword(length) {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+~`|}{[]:;?><,./-=';

    const allCharacters = uppercase + lowercase + numbers + symbols;
    let password = [
        uppercase[Math.floor(Math.random() * uppercase.length)],
        lowercase[Math.floor(Math.random() * lowercase.length)],
        numbers[Math.floor(Math.random() * numbers.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
    ];

    for (let i = password.length; i < length; i++) {
        password.push(allCharacters[Math.floor(Math.random() * allCharacters.length)]);
    }

    return password.sort(() => Math.random() - 0.5).join('');
}