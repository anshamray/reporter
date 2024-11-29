const debug = require('debug')('@testomatio/reporter:pipe:slack');
const path = require('path');
const chalk = require('chalk');
const humanizeDuration = require('humanize-duration');
const merge = require('lodash.merge');
const { WebClient } = require('@slack/web-api');
const { APP_PREFIX, testomatLogoURL } = require('../constants');
const { ansiRegExp, isSameTest } = require('../utils/utils');
const { statusEmoji, fullName } = require('../utils/pipe_utils');

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
    this.token = params.SLACK_TOKEN || process.env.SLACK_TOKEN;
    this.channel = params.SLACK_CHANNEL || process.env.SLACK_CHANNEL;
    this.jobKey = `${process.env.GITHUB_WORKFLOW || ''} / ${process.env.GITHUB_JOB || ''}`;

    debug('Slack Pipe:', this.token ? 'TOKEN' : '*no token*', 'Channel:', this.channel);

    if (!this.token || !this.channel) return;
    this.isEnabled = true;

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

    const passedCount = this.tests.filter(t => t.status === 'passed').length;
    const failedCount = this.tests.filter(t => t.status === 'failed').length;
    const skippedCount = this.tests.filter(t => t.status === 'skipped').length;

    let summary = `*${statusEmoji(runParams.status)} ${`${process.env.GITHUB_JOB || 'Test Run'} ${runParams.status}`.toUpperCase()}*\n`;

    summary += `*Tests:* ✔️  *${this.tests.length}* tests run\n`;
    summary += `*Summary:* ${failedCount ? `${statusEmoji('failed')} *${failedCount}* failed; ` : ''}${statusEmoji('passed')} *${passedCount}* passed; ${statusEmoji('skipped')} *${skippedCount}* skipped\n`;
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

    const failures = this.tests
      .filter(t => t.status === 'failed')
      .slice(0, 20)
      .map(t => {
        let text = `*${statusEmoji('failed')} ${fullName(t)}*\n`;
        if (t.message)
          text += `> ${t.message
            .replace(/[^\x20-\x7E]/g, '')
            .replace(ansiRegExp(), '')
            .trim()}\n`;
        if (t.stack) text += `\`\`\`${t.stack.replace(ansiRegExp(), '').trim()}\`\`\`\n`;

        if (t.artifacts && t.artifacts.length && !process.env.TESTOMATIO_PRIVATE_ARTIFACTS) {
          t.artifacts
            .filter(f => !!f)
            .forEach(f => {
              if (f.endsWith('.png')) {
                text += `<${f}|Screenshot>\n`;
                return text;
              }
              text += `<${f}|${path.basename(f)}>\n`;
              return text;
            });
        }

        text += `\n---\n`;

        return text;
      });

    let body = summary;

    if (failures.length) {
      body += `\n*🟥 Failures (${failures.length})*\n${failures.join('\n')}`;
      if (failures.length > 20) {
        body += `\n> Notice\n> Only first 20 failures shown*`;
      }
    }

    if (this.tests.length > 0) {
      body += `\n*🐢 Slowest Tests*\n`;
      body += this.tests
        .sort((a, b) => b?.run_time - a?.run_time)
        .slice(0, 5)
        .map(t => `• ${fullName(t)} (${humanizeDuration(parseFloat(t.run_time))})`)
        .join('\n');
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
