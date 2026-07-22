export const RECAPTCHA_ACTIONS = {
  contact: "contact_submit",
  report: "mosquito_report_submit",
  locationSuggestion: "location_suggestion_submit",
} as const;

export type RecaptchaAction =
  (typeof RECAPTCHA_ACTIONS)[keyof typeof RECAPTCHA_ACTIONS];
