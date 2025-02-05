const { expect } = require('chai');
const SlackPipe = require('../../lib/pipe/slack');
require('dotenv').config(); // To load environment variables from .env file

describe('SlackPipe tests', () => {
  // Store original env variables
  const originalEnv = {
    SLACK_TOKEN: process.env.SLACK_TOKEN,
    SLACK_CHANNEL: process.env.SLACK_CHANNEL
  };

  // Add debug logging
  before(() => {
    console.log('Environment variables at start:');
    console.log('SLACK_CHANNEL:', process.env.SLACK_CHANNEL);
    console.log('SLACK_TOKEN:', process.env.SLACK_TOKEN ? 'Token exists' : 'No token found');
  });

  // Restore env variables after each test
  afterEach(() => {
    process.env.SLACK_TOKEN = originalEnv.SLACK_TOKEN;
    process.env.SLACK_CHANNEL = originalEnv.SLACK_CHANNEL;
  });

  it('should send a test message to Slack', async () => {
    // Debug log the environment variables
    console.log('Test environment variables:');
    console.log('SLACK_CHANNEL:', process.env.SLACK_CHANNEL);
    console.log('SLACK_TOKEN:', process.env.SLACK_TOKEN ? 'Token exists' : 'No token found');

    const slackPipe = new SlackPipe({
      SLACK_TOKEN: process.env.SLACK_TOKEN,
      SLACK_CHANNEL: process.env.SLACK_CHANNEL
    });

    console.log('Slack pipe config:', {
      token: slackPipe.token ? 'Token exists' : 'No token',
      channel: slackPipe.channel,
      isEnabled: slackPipe.isEnabled
    });

    expect(slackPipe.isEnabled).to.be.true;

    // Add a passed test
    slackPipe.addTest({
      title: 'Successful Test',
      status: 'passed',
      run_time: 1000
    });

    // Add a failed test
    slackPipe.addTest({
      title: 'Failed Test',
      status: 'failed',
      run_time: 800,
      error: 'Example error message'
    });

    // Send the report with overall failed status
    await slackPipe.finishRun({ status: 'failed' });
  });

  it('should not enable pipe without credentials', () => {
    // Temporarily clear env variables for this test
    const tempToken = process.env.SLACK_TOKEN;
    const tempChannel = process.env.SLACK_CHANNEL;
    delete process.env.SLACK_TOKEN;
    delete process.env.SLACK_CHANNEL;

    const slackPipe = new SlackPipe({});
    expect(slackPipe.isEnabled).to.be.false;

    // Restore env variables
    process.env.SLACK_TOKEN = tempToken;
    process.env.SLACK_CHANNEL = tempChannel;
  });
});