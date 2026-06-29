import axios from 'axios';

const BASE_URL = 'https://graph.facebook.com/v20.0';

export interface MetaTextMessage {
  to: string;
  text: string;
}

export interface MetaTemplateMessage {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: object[];
}

export interface MetaWebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  text?: { body: string };
  type: string;
}

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.META_WA_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

function getPhoneId() {
  return process.env.META_WA_PHONE_NUMBER_ID;
}

export async function sendTextMessage({ to, text }: MetaTextMessage) {
  const phoneId = getPhoneId();
  const response = await axios.post(
    `${BASE_URL}/${phoneId}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    },
    { headers: getHeaders() }
  );
  return response.data;
}

export async function sendTemplateMessage({ to, templateName, languageCode = 'pt_BR', components = [] }: MetaTemplateMessage) {
  const phoneId = getPhoneId();
  const response = await axios.post(
    `${BASE_URL}/${phoneId}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    },
    { headers: getHeaders() }
  );
  return response.data;
}

export async function markMessageAsRead(messageId: string) {
  const phoneId = getPhoneId();
  await axios.post(
    `${BASE_URL}/${phoneId}/messages`,
    {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    },
    { headers: getHeaders() }
  );
}
