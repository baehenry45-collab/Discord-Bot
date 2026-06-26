function trimForEmbed(text, max = 3900) {
  const value = String(text || '');
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function resultToEmbeds(result, options = {}) {
  const color = options.color ?? 0xff9f1c;
  const pages = result.pages?.length ? result.pages : [{ title: result.engine || 'Udon_M1', content: result.text || '' }];
  return pages.map((page, index) => {
    const sourceText = (page.sources || [])
      .slice(0, 5)
      .map((source, sourceIndex) => `${sourceIndex + 1}. [${source.name || '출처'}](${source.url || 'https://huggingface.co/'})`)
      .join('\n');

    return {
      color,
      title: page.title || `${result.engine || 'Udon_M1'} · ${index + 1}/${pages.length}`,
      description: trimForEmbed(page.content),
      fields: [
        ...(sourceText ? [{ name: '출처', value: trimForEmbed(sourceText, 900) }] : []),
        ...(result.warnings?.length && index === pages.length - 1
          ? [{ name: '검수 메모', value: result.warnings.slice(0, 5).join(', ') }]
          : [])
      ],
      footer: {
        text: page.footer || `${result.engine || 'Udon_M1'} · ${index + 1}/${pages.length}`
      },
      timestamp: result.createdAt || new Date().toISOString()
    };
  });
}

function shouldShowTeachControls(result) {
  return Boolean(result.learnable || result.warnings?.includes('needs_teaching'));
}

function paginationRow(id, safeIndex, total) {
  return {
    type: 1,
    components: [
      { type: 2, style: 2, custom_id: `udonai:m1:prev:${id}:${safeIndex}`, label: '이전', disabled: safeIndex <= 0 },
      { type: 2, style: 2, custom_id: `udonai:m1:page:${id}:${safeIndex}`, label: `${safeIndex + 1}/${total}`, disabled: true },
      { type: 2, style: 2, custom_id: `udonai:m1:next:${id}:${safeIndex}`, label: '다음', disabled: safeIndex >= total - 1 }
    ]
  };
}

function teachRow(id) {
  return {
    type: 1,
    components: [
      { type: 2, style: 1, custom_id: `udonai:m1:teach:${id}:0`, label: '가르치기' },
      { type: 2, style: 2, custom_id: `udonai:m1:dismiss:${id}:0`, label: '괜찮아' }
    ]
  };
}

function pagePayload(result, pageIndex = 0, options = {}) {
  const embeds = resultToEmbeds(result, options);
  const safeIndex = Math.max(0, Math.min(pageIndex, embeds.length - 1));
  const id = result.id || 'udonai';
  const components = [];
  if (embeds.length > 1) components.push(paginationRow(id, safeIndex, embeds.length));
  if (shouldShowTeachControls(result)) components.push(teachRow(id));

  return {
    embeds: [embeds[safeIndex]],
    components,
    allowedMentions: { parse: [] }
  };
}

function createDiscordBridge(engine, options = {}) {
  const activeResults = new Map();
  const ttlMs = options.ttlMs || 10 * 60 * 1000;

  function rememberResult(result) {
    activeResults.set(result.id, { result, expiresAt: Date.now() + ttlMs });
    for (const [id, item] of activeResults) {
      if (item.expiresAt < Date.now()) activeResults.delete(id);
    }
  }

  return {
    async answerPayload(question, context = {}) {
      const result = await engine.answer(question, context);
      rememberResult(result);
      return {
        result,
        payload: pagePayload(result, 0, options)
      };
    },

    pagePayload(result, pageIndex = 0) {
      rememberResult(result);
      return pagePayload(result, pageIndex, options);
    },

    buildTeachModal(customId) {
      const parts = String(customId || '').split(':');
      if (parts.length < 5 || parts[0] !== 'udonai' || parts[1] !== 'm1' || parts[2] !== 'teach') return null;
      const id = parts[3];
      const item = activeResults.get(id);
      if (!item) return null;
      return {
        custom_id: `udonai:m1:teach-modal:${id}`,
        title: 'Udon_M1 가르치기',
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: 'answer',
                label: '이 말에 어떻게 답하면 돼?',
                style: 2,
                min_length: 1,
                max_length: 1000,
                required: true,
                placeholder: '예: 이건 서버 재시작 방법을 알려주면 돼.'
              }
            ]
          },
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: 'category',
                label: '분류(선택)',
                style: 1,
                max_length: 40,
                required: false,
                placeholder: 'general, coding, server_ops ...'
              }
            ]
          }
        ]
      };
    },

    handleTeachModalSubmit(customId, values = {}, context = {}) {
      const parts = String(customId || '').split(':');
      if (parts.length < 4 || parts[0] !== 'udonai' || parts[1] !== 'm1' || parts[2] !== 'teach-modal') return null;
      const id = parts[3];
      const item = activeResults.get(id);
      if (!item) return null;
      const category = values.category || item.result.category || 'general';
      const document = engine.teach({
        question: item.result.question,
        answer: values.answer,
        category,
        userId: context.userId,
        guildId: context.guildId,
        username: context.username
      });
      return {
        document,
        content: `학습했어. 다음에 비슷한 말이 오면 이 답변을 먼저 참고할게.\n질문: ${item.result.question}`
      };
    },

    handlePageCustomId(customId) {
      const parts = String(customId || '').split(':');
      if (parts.length < 6 || parts[0] !== 'udonai' || parts[1] !== 'm1') return null;
      const action = parts[2];
      const id = parts[3];
      const current = Number(parts[4] || 0);
      const item = activeResults.get(id);
      if (!item) return null;
      const total = item.result.pages?.length || 1;
      const nextIndex = action === 'prev' ? current - 1 : action === 'next' ? current + 1 : current;
      return pagePayload(item.result, Math.max(0, Math.min(nextIndex, total - 1)), options);
    },

    handleDismissCustomId(customId) {
      const parts = String(customId || '').split(':');
      if (parts.length < 5 || parts[0] !== 'udonai' || parts[1] !== 'm1' || parts[2] !== 'dismiss') return null;
      return { components: [] };
    }
  };
}

module.exports = {
  createDiscordBridge,
  resultToEmbeds,
  pagePayload
};
