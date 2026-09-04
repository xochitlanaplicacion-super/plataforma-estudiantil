export type PersistedFile = {
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
};

export type EarlyDepartureDraft = {
  version: 1;
  clientRequestId: string;
  step: number;
  status: 'draft' | 'queued';
  updatedAt: string;
  values: Record<string, string | boolean>;
  student: Record<string, unknown> | null;
  identificationEvidence: PersistedFile | null;
  pickupPersonPhoto: PersistedFile | null;
  finalHandoverPhoto: PersistedFile | null;
  pickupSignature?: PersistedFile | null;
};

export type ExtraordinaryHandoffDraft = {
  version: 1;
  clientRequestId: string;
  step: number;
  status: 'draft' | 'queued';
  updatedAt: string;
  values: Record<string, string | boolean>;
  student: Record<string, unknown> | null;
  files: Record<string, PersistedFile | null>;
};

export type FamilyRegistrationDraft = {
  version: 1;
  clientRequestId: string;
  values: Record<string, string | boolean>;
  people: Array<Record<string, string>>;
  files: Record<string, PersistedFile | null>;
  updatedAt: string;
};

export type LateEntryDraft = {
  version: 1;
  clientRequestId: string;
  status: 'draft' | 'queued';
  updatedAt: string;
  student: Record<string, unknown> | null;
  values: {
    studentQuery: string;
    reason: string;
    reasonDetail: string;
    automaticTime: boolean;
    arrivedAt: string;
    reporter: string;
  };
  evidence: PersistedFile | null;
};

const DATABASE_NAME = 'control-filtro-offline';
const STORE_NAME = 'drafts';
let writeQueue: Promise<unknown> = Promise.resolve();
function draftKey(scope: string) {
  if (!scope || scope.length > 160) throw new Error('El ámbito local del borrador no es válido.');
  return `early-departure:${scope}`;
}

function extraordinaryDraftKey(scope: string) {
  if (!scope || scope.length > 160) throw new Error('El ámbito local del borrador no es válido.');
  return `extraordinary-handoff:${scope}`;
}
function familyDraftKey(scope: string) {
  if (!scope || scope.length > 180) throw new Error('El enlace local no es válido.');
  return `family-registration:${scope}`;
}
function lateDraftKey(scope: string) {
  if (!scope || scope.length > 180) throw new Error('El ámbito local del retardo no es válido.');
  return `late-entry:${scope}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('El almacenamiento local no está disponible.'));
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir el almacenamiento local.'));
  });
}

async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo guardar el borrador.'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error || new Error('Falló el almacenamiento local.'));
  });
}

export function persistFile(file: File | null): PersistedFile | null {
  return file ? { blob: file, name: file.name, type: file.type, lastModified: file.lastModified } : null;
}

export function restoreFile(file: PersistedFile | null): File | null {
  return file ? new File([file.blob], file.name, { type: file.type, lastModified: file.lastModified }) : null;
}

export function getEarlyDepartureDraft(scope: string) {
  return writeQueue.catch(() => undefined).then(() => transact<EarlyDepartureDraft | undefined>('readonly', (store) => store.get(draftKey(scope))));
}

export function saveEarlyDepartureDraft(scope: string, draft: EarlyDepartureDraft) {
  const write = writeQueue.catch(() => undefined).then(() => transact<IDBValidKey>('readwrite', (store) => store.put(draft, draftKey(scope))));
  writeQueue = write;
  return write;
}

export function clearEarlyDepartureDraft(scope: string) {
  const write = writeQueue.catch(() => undefined).then(() => transact<undefined>('readwrite', (store) => store.delete(draftKey(scope))));
  writeQueue = write;
  return write;
}


export function getExtraordinaryHandoffDraft(scope: string) {
  return writeQueue.catch(() => undefined).then(() => transact<ExtraordinaryHandoffDraft | undefined>('readonly', (store) => store.get(extraordinaryDraftKey(scope))));
}

export function saveExtraordinaryHandoffDraft(scope: string, draft: ExtraordinaryHandoffDraft) {
  const write = writeQueue.catch(() => undefined).then(() => transact<IDBValidKey>('readwrite', (store) => store.put(draft, extraordinaryDraftKey(scope))));
  writeQueue = write;
  return write;
}

export function clearExtraordinaryHandoffDraft(scope: string) {
  const write = writeQueue.catch(() => undefined).then(() => transact<undefined>('readwrite', (store) => store.delete(extraordinaryDraftKey(scope))));
  writeQueue = write;
  return write;
}

export function getFamilyRegistrationDraft(scope: string) {
  return writeQueue.catch(() => undefined).then(() => transact<FamilyRegistrationDraft | undefined>('readonly', (store) => store.get(familyDraftKey(scope))));
}
export function saveFamilyRegistrationDraft(scope: string, draft: FamilyRegistrationDraft) {
  const write = writeQueue.catch(() => undefined).then(() => transact<IDBValidKey>('readwrite', (store) => store.put(draft, familyDraftKey(scope))));
  writeQueue = write; return write;
}
export function clearFamilyRegistrationDraft(scope: string) {
  const write = writeQueue.catch(() => undefined).then(() => transact<undefined>('readwrite', (store) => store.delete(familyDraftKey(scope))));
  writeQueue = write; return write;
}

export function getLateEntryDraft(scope: string) {
  return writeQueue.catch(() => undefined).then(() => transact<LateEntryDraft | undefined>('readonly', (store) => store.get(lateDraftKey(scope))));
}
export function saveLateEntryDraft(scope: string, draft: LateEntryDraft) {
  const write = writeQueue.catch(() => undefined).then(() => transact<IDBValidKey>('readwrite', (store) => store.put(draft, lateDraftKey(scope))));
  writeQueue = write; return write;
}
export function clearLateEntryDraft(scope: string) {
  const write = writeQueue.catch(() => undefined).then(() => transact<undefined>('readwrite', (store) => store.delete(lateDraftKey(scope))));
  writeQueue = write; return write;
}
