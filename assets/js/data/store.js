/** Escolhe o armazenamento: Firebase (produção) ou local (demonstração/testes). */
export async function createStore(config) {
  if (config.firebase && config.firebase.projectId) {
    const { createFirebaseStore } = await import('./firebase.js');
    return createFirebaseStore(config);
  }
  const { createLocalStore } = await import('./local.js');
  return createLocalStore();
}
