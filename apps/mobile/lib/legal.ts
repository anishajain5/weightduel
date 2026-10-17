/** DRAFT policy text. Needs review by a lawyer before public launch. */
export const LEGAL = {
  privacy: {
    title: "Privacy Policy",
    sections: [
      ["What we collect", "Your email, display name, weigh-ins, optional notes, habit check-ins, optional scale photos, and the time zone and reminder time you set. We also keep technical logs (IP address, device type) for security and abuse prevention."],
      ["What other people see", "Members of a competition you join see what that competition's privacy setting allows (by default your percentage change and rank, never raw weight, notes, or email). Your private notes are never shared with anyone."],
      ["AI features", "When you use the scale reader, coach, or recipe ideas, the photo or a summary of your own recent data is sent to our AI provider (Anthropic) to produce a response. We never send your name or email, and your notes are shortened. Providers do not use this to train their models under our API terms."],
      ["Where data lives", "Your data is stored in our managed database. Emails are sent through our email provider and push notifications through Expo."],
      ["Your choices", "You can export your weigh-ins as a CSV from Profile and permanently delete your account and all data at any time. Deletion removes your entries, photos and memberships; it can't be undone."],
      ["Contact", "Questions or requests: support@weighinduel.example."],
    ],
  },
  terms: {
    title: "Terms of Use",
    sections: [
      ["Not medical advice", "Weigh-In Duel is a friendly competition and tracking tool. It does not provide medical advice. Talk to a doctor before changing your diet or exercise, especially if you have a medical condition or a history of disordered eating."],
      ["Be kind", "Competitions are social. Don't harass others, share other people's information, or upload photos that aren't of your own scale. We may remove content or accounts that break these rules."],
      ["Your account", "Keep your password safe. You must be 16 or older to use the app. You're responsible for activity on your account."],
      ["AI output", "AI suggestions can be wrong. Check any weight an AI reads from a photo, and treat coaching and recipes as general ideas, not professional advice."],
      ["Availability", "The service is provided as is. We may change or stop features, and AI features may pause when daily limits are reached."],
    ],
  },
} as const;
