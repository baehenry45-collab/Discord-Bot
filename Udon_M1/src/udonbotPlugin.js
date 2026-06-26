const path = require('path');
const { createUdonAIM1 } = require('./core/engine');
const { createDiscordBridge } = require('./adapters/discordBridge');

function defaultShouldRespond(message, triggers) {
  if (!message || message.author?.bot) return false;
  const content = String(message.content || '').trim();
  if (!content) return false;
  return triggers.some((trigger) => content.startsWith(trigger) || content.includes(`<@${trigger}>`));
}

function cleanQuestion(content, triggers) {
  let text = String(content || '').trim();
  for (const trigger of triggers) {
    if (text.startsWith(trigger)) text = text.slice(trigger.length).trim();
  }
  return text || content;
}

function modalValue(interaction, id) {
  try {
    return interaction.fields?.getTextInputValue?.(id) || '';
  } catch {
    return '';
  }
}

function registerUdonAIM1(client, options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname, '..');
  const engine = options.engine || createUdonAIM1({
    rootDir,
    ownerId: options.ownerId || '545157127690256388',
    memoryDir: options.memoryDir || path.join(rootDir, 'memory')
  });
  const bridge = createDiscordBridge(engine, options.discord || {});
  const triggers = options.triggers || ['우돈아', '우돈봇'];
  const shouldRespond = options.shouldRespond || ((message) => defaultShouldRespond(message, triggers));

  async function onMessageCreate(message) {
    if (!shouldRespond(message)) return;
    const question = cleanQuestion(message.content, triggers);
    const typing = message.channel?.sendTyping?.();
    if (typing?.catch) typing.catch(() => null);

    const { payload } = await bridge.answerPayload(question, {
      userId: message.author?.id,
      guildId: message.guildId || message.guild?.id,
      username: message.author?.username,
      channelId: message.channelId
    });
    await message.reply(payload);
  }

  async function onInteractionCreate(interaction) {
    if (interaction.isModalSubmit?.() && String(interaction.customId || '').startsWith('udonai:m1:teach-modal:')) {
      const result = bridge.handleTeachModalSubmit(
        interaction.customId,
        {
          answer: modalValue(interaction, 'answer'),
          category: modalValue(interaction, 'category')
        },
        {
          userId: interaction.user?.id,
          guildId: interaction.guildId || interaction.guild?.id,
          username: interaction.user?.username
        }
      );
      if (!result) return;
      if (interaction.reply) {
        await interaction.reply({ content: result.content, ephemeral: true, allowedMentions: { parse: [] } });
      }
      return;
    }

    if (!interaction.isButton?.()) return;

    const modal = bridge.buildTeachModal(interaction.customId);
    if (modal && interaction.showModal) {
      await interaction.showModal(modal);
      return;
    }

    const dismissed = bridge.handleDismissCustomId(interaction.customId);
    if (dismissed && interaction.update) {
      await interaction.update(dismissed);
      return;
    }

    const payload = bridge.handlePageCustomId(interaction.customId);
    if (!payload) return;
    if (interaction.update) await interaction.update(payload);
  }

  client.on('messageCreate', onMessageCreate);
  client.on('interactionCreate', onInteractionCreate);

  return {
    engine,
    bridge,
    unregister() {
      client.off?.('messageCreate', onMessageCreate);
      client.off?.('interactionCreate', onInteractionCreate);
    }
  };
}

module.exports = {
  registerUdonAIM1
};
