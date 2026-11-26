/**
 * Armazenamento em produção: Firebase Auth + Cloud Firestore (+ App Check opcional).
 * O SDK é carregado do CDN oficial do Google, com versão fixa, só quando há configuração.
 * A segurança de verdade está em firebase/firestore.rules.
 */
const V = '10.14.1';
const CDN = `https://www.gstatic.com/firebasejs/${V}/`;

export async function createFirebaseStore(config) {
  const [{ initializeApp }, fs, au] = await Promise.all([
    import(CDN + 'firebase-app.js'),
    import(CDN + 'firebase-firestore.js'),
    import(CDN + 'firebase-auth.js'),
  ]);
  const app = initializeApp(config.firebase, config.appName); // appName: só usado nos testes (duas contas ao mesmo tempo)
  if (config.appCheckSiteKey) {
    const ac = await import(CDN + 'firebase-app-check.js');
    ac.initializeAppCheck(app, { provider: new ac.ReCaptchaV3Provider(config.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  }
  const db = fs.getFirestore(app);
  const auth = au.getAuth(app);
  // Só para desenvolvimento/testes locais com os emuladores do Firebase.
  if (config.emulator) {
    fs.connectFirestoreEmulator(db, config.emulator.firestore[0], config.emulator.firestore[1]);
    au.connectAuthEmulator(auth, config.emulator.auth, { disableWarnings: true });
  }
  const cfg = (n) => fs.doc(db, 'config', n);
  // rec = hora do SERVIDOR em que o pedido chegou (o celular do cliente não consegue falsificar).
  // É ela que define a ordem da fila. Enquanto o servidor não confirma, o valor vem nulo e usamos t.
  const norm = (d) => ({ ...d, rec: d.rec && d.rec.toMillis ? d.rec.toMillis() : d.t });
  const watchDoc = (ref) => (cb) => fs.onSnapshot(ref, (s) => cb(s.exists() ? s.data() : null), () => cb(null));

  return {
    mode: 'firebase',
    onMenu: watchDoc(cfg('menu')), onOps: watchDoc(cfg('ops')), onPlan: watchDoc(cfg('plan')),
    createOrder: (o) => fs.setDoc(fs.doc(db, 'orders', o.id), { ...o, rec: fs.serverTimestamp() }),
    onOrder: (id, cb) => fs.onSnapshot(fs.doc(db, 'orders', id), (s) => cb(s.exists() ? norm(s.data({ serverTimestamps: 'estimate' })) : null), () => cb(null)),
    addLead: (l) => fs.setDoc(fs.doc(db, 'leads', l.id), l),
    auth: {
      onChange: (cb) => au.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email } : null)),
      signIn: (email, senha) => au.signInWithEmailAndPassword(auth, email.trim(), senha),
      signOut: () => au.signOut(auth),
    },
    onTeam: (cb, onErr) => fs.onSnapshot(fs.doc(db, 'staff', 'team'), (s) => cb(s.exists() ? s.data() : null), (e) => onErr && onErr(e)),
    setTeam: (v) => fs.setDoc(fs.doc(db, 'staff', 'team'), v),
    setMenu: (v) => fs.setDoc(cfg('menu'), v),
    setOps: (v) => fs.setDoc(cfg('ops'), v),
    setPlan: (v) => fs.setDoc(cfg('plan'), v),
    onOrders(from, to, cb, onErr) {
      const q = fs.query(fs.collection(db, 'orders'), fs.where('t', '>=', from), fs.where('t', '<', to), fs.orderBy('t', 'asc'));
      return fs.onSnapshot(q, (s) => cb(s.docs.map((d) => norm(d.data({ serverTimestamps: 'estimate' })))), (e) => onErr && onErr(e));
    },
    updateOrder: (id, patch) => fs.updateDoc(fs.doc(db, 'orders', id), patch),
    onLeads(cb, onErr) {
      const q = fs.query(fs.collection(db, 'leads'), fs.orderBy('t', 'desc'), fs.limit(1000));
      return fs.onSnapshot(q, (s) => cb(s.docs.map((d) => d.data())), (e) => onErr && onErr(e));
    },
  };
}
