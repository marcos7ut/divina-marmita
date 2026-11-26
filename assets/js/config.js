/**
 * Configuração PÚBLICA do site. Nada aqui é segredo:
 * a chave do Firebase Web identifica o projeto, quem protege os dados são as
 * regras do Firestore (firebase/firestore.rules) e o App Check.
 * Veja docs/SETUP-FIREBASE.md.
 */
export const CONFIG = {
  // Cole aqui o objeto "firebaseConfig" do console do Firebase.
  // Enquanto estiver null, o site roda em MODO DEMONSTRAÇÃO (dados só neste navegador).
  firebase: null,
  /* Exemplo:
  firebase: {
    apiKey: 'AIza...', authDomain: 'SEU-PROJETO.firebaseapp.com',
    projectId: 'SEU-PROJETO', appId: '1:000000000000:web:abcdef',
  },
  */
  // Chave do site do reCAPTCHA v3 para o App Check (recomendado). Vazio = desligado.
  appCheckSiteKey: '',

  negocio: {
    nome: 'Divina Marmita',
    whatsapp: '5515997857492',
    whatsappExibicao: '15 99785-7492',
    whatsapp2: '5511964103889',
    instagram: 'divina_marmita26',
    endereco: 'Rua João Mostafá, 602 – Bairro do Éden',
    horario: 'Seg a Sáb · 11h–14h e 18h30–22h',
  },
};
