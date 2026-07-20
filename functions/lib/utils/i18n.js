"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.t = t;
const translations = {
    he: {
        whatsapp_glitch_tenant: "מערכת WhatsApp חוותה שגיאה זמנית בעיבוד הלחיצה. אנא נסה ללחוץ שוב, או הקלד את שם הבניין/יישוב במילים.",
        whatsapp_glitch_menu: "מערכת WhatsApp חוותה שגיאה זמנית בעיבוד הלחיצה. אנא נסה ללחוץ שוב, או הקלד את בחירתך במילים (למשל: 'עם תמונה', 'דיווח מהיר', או המספרים 1, 2, 3).",
        whatsapp_glitch_generic: "מערכת WhatsApp חוותה שגיאה זמנית בעיבוד הלחיצה. אנא נסה ללחוץ שוב על הכפתור.",
        select_tenant_fallback: "אנא בחר את הבניין/יישוב מתוך הכפתורים, או הקלד את שמו במילים.",
        not_registered: "מצטערים, מספר הטלפון שלך אינו רשום במערכת TikTak. אנא פנה לוועד הבית או לנציג השירות שלך לאישור.",
        rate_limit: "מערכת TikTak זיהתה קצב הודעות גבוה. אנא המתן 30 שניות לפני שליחת הודעה נוספת.",
        rating_thank_you: "תודה על הדירוג! המשוב שלך עוזר לנו לשפר את השירות לתושב/דייר. 🏡",
        select_tenant_title: "לאן נרצה לדווח כעת?\n\nבכל שלב, אם תרצה לצאת מהתהליך רשום *צא* או *ביטול*.",
        no_quicktap_config_building: "מנהל המערכת לא הגדיר דיווחים מהירים עבור הבניין שלך.",
        no_quicktap_config_municipality: "מנהל המערכת לא הגדיר דיווחים מהירים עבור היישוב/מועצה שלך."
    },
    en: {
        whatsapp_glitch_tenant: "WhatsApp experienced a temporary error. Please try clicking again, or type the building/settlement name.",
        whatsapp_glitch_menu: "WhatsApp experienced a temporary error. Please try clicking again, or type your choice (e.g., 'with image', 'quick report', or numbers 1, 2, 3).",
        whatsapp_glitch_generic: "WhatsApp experienced a temporary error. Please try clicking the button again.",
        select_tenant_fallback: "Please select the building/settlement from the buttons, or type its name in words.",
        not_registered: "Sorry, your phone number is not registered in the TikTak system. Please contact your building committee or service representative for authorization.",
        rate_limit: "TikTak system detected a high rate of messages. Please wait 30 seconds before sending another message.",
        rating_thank_you: "Thank you for the rating! Your feedback helps us improve the service for residents. 🏡",
        select_tenant_title: "Where would we like to report now?\n\nAt any step, if you want to exit the process write *exit* or *cancel*.",
        no_quicktap_config_building: "The system administrator has not configured quick reports for your building.",
        no_quicktap_config_municipality: "The system administrator has not configured quick reports for your settlement/council."
    }
};
function t(key, lang = "he") {
    const language = lang === "en" ? "en" : "he";
    return translations[language][key] || translations["he"][key] || key;
}
//# sourceMappingURL=i18n.js.map