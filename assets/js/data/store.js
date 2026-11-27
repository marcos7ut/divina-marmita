/** Escolhe o armazenamento: Firebase (produção) ou local (demonstração/testes). */
export async function createStore(config) {
  // ?demo=1 força o modo demonstração (dados só no navegador), útil para testar sem mexer nos dados reais.
  const demo = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');
  if (config.firebase && config.firebase.projectId && !demo) {
    const { createFirebaseStore } = await import('./firebase.js');
    return createFirebaseStore(config);
  }
  const { createLocalStore } = await import('./local.js');
  return createLocalStore();
}
