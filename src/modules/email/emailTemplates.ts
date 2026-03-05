interface EmailContext {
  businessName: string;
  niche: string;
  city: string;
  websiteUrl: string;
}

export function getEmailSequence(ctx: EmailContext) {
  return [
    {
      sequenceNumber: 1,
      subject: `I built a website for ${ctx.businessName}`,
      body:
        `Hi,\n\n` +
        `I noticed ${ctx.businessName} doesn't have a website yet. ` +
        `As a ${ctx.niche.toLowerCase()} in ${ctx.city}, you're missing out on customers searching online.\n\n` +
        `I went ahead and built one for you — take a look:\n` +
        `${ctx.websiteUrl}\n\n` +
        `It's mobile-friendly and ready to go. If you'd like to keep it, I can set it up on your own domain.\n\n` +
        `Let me know what you think!\n\n` +
        `Best regards`,
      delay: 0,
    },
    {
      sequenceNumber: 2,
      subject: `Re: Website for ${ctx.businessName}`,
      body:
        `Hi,\n\n` +
        `Just wanted to follow up on the website I built for ${ctx.businessName}:\n` +
        `${ctx.websiteUrl}\n\n` +
        `Happy to walk you through it or make any changes. ` +
        `No obligation at all.\n\n` +
        `Best regards`,
      delay: 3 * 24 * 60 * 60 * 1000, // 3 days in ms
    },
    {
      sequenceNumber: 3,
      subject: `Last note about ${ctx.businessName}'s website`,
      body:
        `Hi,\n\n` +
        `Final follow-up — the website I built for ${ctx.businessName} is still live at:\n` +
        `${ctx.websiteUrl}\n\n` +
        `If you're interested in keeping it, just reply to this email. ` +
        `Otherwise, no worries at all.\n\n` +
        `Best regards`,
      delay: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    },
  ];
}
