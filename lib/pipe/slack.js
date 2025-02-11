const debug = require('debug')('@testomatio/reporter:pipe:slack');
const path = require('path');
const chalk = require('chalk');
const humanizeDuration = require('humanize-duration');
const merge = require('lodash.merge');
const { WebClient } = require('@slack/web-api');
const { APP_PREFIX } = require('../constants');
const { ansiRegExp, isSameTest } = require('../utils/utils');
const { statusEmoji, fullName } = require('../utils/pipe_utils');

function getLastNonZeroStep(message) {
  const STEPS_MARKER = "################[ Steps ]################";
  
  // Split the message by newlines
  const lines = message.split(/\r?\n/);

  // Find where the steps start
  const stepsStartIndex = lines.findIndex(line => line.includes(STEPS_MARKER));

  if (stepsStartIndex === -1) {
    console.log('Steps marker not found'); // Log if the steps marker is not found
    return null;
  }
  
  let lastNonZeroStep = null;
  
  // Start scanning from the line after the marker
  for (let i = stepsStartIndex + 1; i < lines.length; i++) {
    // Remove ANSI escape codes
    const line = lines[i].replace(ansiRegExp(), '').trim();
    
    // Look for something like (54.25ms) at the end
    const match = line.match(/\(([\d.]+)ms\)/);

    if (match) {
      const duration = parseFloat(match[1]); // e.g., 54.25
      if (duration > 0) {
        lastNonZeroStep = line;

        console.log('Updated last non-zero step:', lastNonZeroStep); // Log the last non-zero step
      }
    }
  }
  
  if (!lastNonZeroStep) {
    console.log('No non-zero step found'); // Log if no non-zero step is found
  }

  return lastNonZeroStep;
}

/**
 * @typedef {import('../../types').Pipe} Pipe
 * @typedef {import('../../types').TestData} TestData
 * @class SlackPipe
 * @implements {Pipe}
 */
class SlackPipe {
  constructor(params, store = {}) {
    this.isEnabled = false;
    this.store = store;
    this.tests = [];
    
    
    // Debug log the incoming params
    console.log('SlackPipe constructor params:', {
      hasToken: !!params.SLACK_TOKEN,
      hasChannel: !!params.SLACK_CHANNEL,
      envToken: !!process.env.SLACK_TOKEN,
      envChannel: !!process.env.SLACK_CHANNEL
    });

    this.token = params.SLACK_TOKEN || process.env.SLACK_TOKEN;
    this.channel = params.SLACK_CHANNEL || process.env.SLACK_CHANNEL;
    this.jobKey = `${process.env.GITHUB_WORKFLOW || ''} / ${process.env.GITHUB_JOB || ''}`;

    debug('Slack Pipe:', this.token ? 'TOKEN' : '*no token*', 'Channel:', this.channel);

    if (!this.token || !this.channel) {
      console.log('SlackPipe not enabled - missing credentials:', {
        hasToken: !!this.token,
        hasChannel: !!this.channel
      });
      return;
    }

    this.isEnabled = true;
    console.log('SlackPipe enabled successfully');
    console.log('New SlackPipe will send reports to channel:', this.channel);

    this.start = new Date();

    debug('Slack Pipe: Enabled');
  }

  async prepareRun() {}

  async createRun() {}

  addTest(test) {
    if (!this.isEnabled) return;
    debug('Adding test:', test);

    const index = this.tests.findIndex(t => isSameTest(t, test));
    if (index >= 0) {
      this.tests[index] = merge(this.tests[index], test);
      return;
    }

    this.tests.push(test);
  }

  async finishRun(runParams) {
    if (!this.isEnabled) return;

    if (runParams.tests) runParams.tests.forEach(t => this.addTest(t));

    this.slackClient = new WebClient(this.token);

    const passedTests = this.tests.filter(t => t.status === 'passed');
    const failedTests = this.tests.filter(t => t.status === 'failed');
    const skippedTests = this.tests.filter(t => t.status === 'skipped');

    let summary = `*${statusEmoji(runParams.status)} ${`${process.env.GITHUB_JOB || 'Test Run'} ${runParams.status}`.toUpperCase()}*\n`;
    summary += `*Tests:* ✔️  *${this.tests.length}* tests run\n`;
    summary += `*Summary:* ${failedTests.length ? `${statusEmoji('failed')} *${failedTests.length}* failed; ` : ''}${statusEmoji('passed')} *${passedTests.length}* passed; ${statusEmoji('skipped')} *${skippedTests.length}* skipped\n`;
    summary += `*Duration:* 🕐  *${humanizeDuration(
      parseInt(
        this.tests.reduce((a, t) => a + (t.run_time || 0), 0),
        10,
      ),
      {
        maxDecimalPoints: 0,
      },
    )}*\n`;

    if (this.store.runUrl) {
      summary += `*Testomat.io Report:* 📊 <${this.store.runUrl}|Run #${this.store.runId}>\n`;
    }
    if (process.env.GITHUB_WORKFLOW) {
      summary += `*Job:* 🗂️  <${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}|${this.jobKey}>\n`;
    }
    if (process.env.RUNNER_OS) {
      summary += `*Operating System:* 🖥️ \`${process.env.RUNNER_OS}\` ${process.env.RUNNER_ARCH || ''}\n`;
    }

    let body = summary;

    // Add passed tests section
    if (passedTests.length) {
      body += `\n*✅ Passed Tests (${passedTests.length})*\n`;
      body += passedTests.map(t => `• ${fullName(t)} (${humanizeDuration(parseFloat(t.run_time), { maxDecimalPoints: 0 })})`).join('\n');
    }
    
    // Add failed tests section
    if (failedTests.length) {
      body += `\n\n*❌ Failed Tests (${failedTests.length})*\n`;
      body += failedTests.map(t => {
        let text = `*${fullName(t)} (${humanizeDuration(parseFloat(t.run_time), { maxDecimalPoints: 0 })})*\n`;
        
        if (t.message) {
          // Format error message with proper line breaks
          const formattedMessage = t.message
            .replace(/[^\x20-\x7E]/g, '')
            .replace(ansiRegExp(), '')
            .replace(/\s+at\s+/g, '\n    at ') // Add line breaks before stack trace lines
            .trim();
          
          text += `\`\`\`\n${formattedMessage}\n\`\`\`\n`;
        }

        text += `\`\`\`\n> Failed at: ${getLastNonZeroStep(t.stack)}\n\`\`\`\n`;
        text += `---\n`;
        return text;
      }).join('\n');
    }

    // Send the message to Slack
    try {
      debug('Sending message to Slack\n', body);
      const resp = await this.slackClient.chat.postMessage({
        channel: this.channel,
        text: body,
        mrkdwn: true,
      });

      const ts = resp.ok ? resp.ts : '';
      debug('Message sent:', ts);
      this.store.slackTs = ts;

      console.log(APP_PREFIX, chalk.yellow('Slack'), `Report sent to channel: ${chalk.magenta(this.channel)}`);
    } catch (err) {
      console.log(APP_PREFIX, chalk.yellow('Slack'), `Couldn't send Slack report: ${err}`);
    }
  }

  toString() {
    return 'Slack Reporter';
  }
}

module.exports = SlackPipe;
