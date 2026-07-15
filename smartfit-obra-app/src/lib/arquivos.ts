import { supabaseBrowser } from './supabase/client';

export const BUCKET = 'arquivos';
export const TAM_MAX = 50 * 1024 * 1024; // 50 MB

export const DISCIPLINAS = [
  'Arquitetura', 'Estrutura', 'Fundação', 'Estrutura Metálica',
  'Elétrica', 'Hidrossanitário', 'Incêndio', 'SPDA', 'Climatização',
  'Terraplenagem', 'Prefeitura / Legal', 'Outros',
];

export const TIPOS_DOC: Record<string, string> = {
  certidao: 'Certidão',
  apolice: 'Apólice de seguro',
  art_rrt: 'ART / RRT',
  licenca: 'Licença / Alvará',
  contrato: 'Contrato / Aditivo',
  nota: 'Nota fiscal',
  outro: 'Outro',
};

export const fmtTamanho = (b?: number | null) => {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
};

/** Sobe o arquivo e devolve o caminho no storage. */
export async function subirArquivo(file: File, pasta: string) {
  if (file.size > TAM_MAX) throw new Error('Arquivo maior que 50 MB.');
  const supabase = supabaseBrowser();
  const limpo = file.name.replace(/[^\w.\-]/g, '_');
  const path = `${pasta}/${Date.now()}_${limpo}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);
  return { path, nome: file.name, tamanho: file.size };
}

/** Gera link temporário (1 h) para abrir/baixar. */
export async function baixarArquivo(path: string) {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  window.open(data.signedUrl, '_blank');
}

export async function apagarArquivo(path: string) {
  const supabase = supabaseBrowser();
  await supabase.storage.from(BUCKET).remove([path]);
}

/** Situação da validade de um documento. */
export function validadeSit(validade?: string | null) {
  if (!validade) return { rotulo: 'sem validade', cls: 'st-pend', dias: null as number | null };
  const dias = Math.ceil((new Date(validade + 'T12:00:00').getTime() - Date.now()) / 86400000);
  if (dias < 0) return { rotulo: 'VENCIDO', cls: 'st-risk', dias };
  if (dias <= 30) return { rotulo: `VENCE EM ${dias}D`, cls: 'st-valid', dias };
  return { rotulo: 'VIGENTE', cls: 'st-ok', dias };
}
