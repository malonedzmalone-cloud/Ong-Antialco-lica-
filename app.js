"use strict";

const chave = "aaa-jaboticaba.reunioes.v1";
const porId = (id) => document.getElementById(id);
const form = porId("form");
const lista = porId("lista");
const arquivo = porId("arquivo");
const formatoNumero = new Intl.NumberFormat("pt-BR");
let editando = null;
let reunioes = [];
let leituraFalhou = false;

function informar(mensagem, erro = false) {
  const aviso = porId("aviso");
  aviso.textContent = mensagem;
  aviso.classList.toggle("error", erro);
  aviso.hidden = false;
}

function validarCampos({ data, hora, tema, quantidade }) {
  if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data) || data.startsWith("0000")) return false;
  const dia = new Date(data + "T00:00:00Z");
  return Number.isFinite(dia.getTime()) && dia.toISOString().slice(0, 10) === data
    && typeof hora === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(hora)
    && typeof tema === "string" && tema.trim().length > 0 && tema.trim().length <= 150
    && Number.isSafeInteger(quantidade) && quantidade >= 0;
}

function lerBackup(texto) {
  const backup = JSON.parse(texto);
  if (backup?.versao !== 1 || !Array.isArray(backup.reunioes)) throw new Error("Formato inválido");
  const ids = new Set();
  return backup.reunioes.map((item) => {
    if (!item || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id) || !validarCampos(item)) {
      throw new Error("Registro inválido");
    }
    const { id, data, hora, tema, quantidade } = item;
    ids.add(id);
    return { id, data, hora, tema: tema.trim(), quantidade };
  });
}

function serializar(registros) {
  return JSON.stringify({ versao: 1, reunioes: registros }, null, 2);
}

function gravar(registros) {
  try {
    localStorage.setItem(chave, serializar(registros));
  } catch {
    informar("Não foi possível salvar. Verifique se o navegador permite armazenamento local e se há espaço disponível.", true);
    return false;
  }
  reunioes = registros;
  leituraFalhou = false;
  renderizar();
  return true;
}

function mostrarData(data) {
  return data.split("-").reverse().join("/");
}

function botao(texto, acao, classe = "") {
  const elemento = document.createElement("button");
  elemento.type = "button";
  elemento.textContent = texto;
  elemento.className = classe;
  elemento.addEventListener("click", acao);
  return elemento;
}

function renderizar() {
  porId("total").textContent = formatoNumero.format(reunioes.length);
  const soma = reunioes.reduce((total, registro) => total + BigInt(registro.quantidade), 0n);
  porId("participacoes").textContent = formatoNumero.format(soma);
  porId("vazio").hidden = reunioes.length > 0 || leituraFalhou;
  porId("csv").disabled = leituraFalhou;
  porId("backup").disabled = leituraFalhou;
  porId("salvar").disabled = leituraFalhou;
  lista.replaceChildren();
  const ordenadas = [...reunioes].sort((a, b) =>
    b.data.localeCompare(a.data) || b.hora.localeCompare(a.hora));
  for (const registro of ordenadas) {
    const item = document.createElement("li");
    item.className = "record";
    const detalhes = document.createElement("div");
    detalhes.style.minWidth = "0";
    const tema = document.createElement("strong");
    tema.textContent = registro.tema;
    const resumo = document.createElement("p");
    const unidade = registro.quantidade === 1 ? "participante" : "participantes";
    resumo.textContent = mostrarData(registro.data) + " às " + registro.hora
      + " · " + formatoNumero.format(registro.quantidade) + " " + unidade;
    detalhes.append(tema, resumo);
    const acoes = document.createElement("div");
    acoes.className = "actions";
    acoes.append(botao("Editar", () => editar(registro)),
      botao("Excluir", () => excluir(registro), "danger"));
    item.append(detalhes, acoes);
    lista.append(item);
  }
}

function limparForm() {
  editando = null;
  form.reset();
  porId("form-titulo").textContent = "Nova reunião";
  porId("salvar").textContent = "Cadastrar reunião";
  porId("cancelar").hidden = true;
}

function editar(registro) {
  editando = registro.id;
  for (const campo of ["data", "hora", "tema", "quantidade"]) {
    porId(campo).value = registro[campo];
  }
  porId("form-titulo").textContent = "Editar reunião";
  porId("salvar").textContent = "Salvar alterações";
  porId("cancelar").hidden = false;
  porId("data").focus();
}

function excluir(registro) {
  if (!confirm("Excluir a reunião “" + registro.tema + "” de " + mostrarData(registro.data) + "?")) return;
  if (gravar(reunioes.filter(({ id }) => id !== registro.id))) {
    if (editando === registro.id) limparForm();
    informar("Reunião excluída.");
  }
}

form.addEventListener("submit", (evento) => {
  evento.preventDefault();
  if (leituraFalhou) return;
  const registro = {
    id: editando ?? crypto.randomUUID(),
    data: porId("data").value,
    hora: porId("hora").value,
    tema: porId("tema").value.trim(),
    quantidade: porId("quantidade").valueAsNumber
  };
  if (!validarCampos(registro)) {
    informar("Preencha uma data e um horário válidos, um tema e uma quantidade inteira igual ou maior que zero.", true);
    return;
  }
  const atualizadas = editando
    ? reunioes.map((item) => item.id === editando ? registro : item)
    : [...reunioes, registro];
  if (gravar(atualizadas)) {
    informar(editando ? "Alterações salvas." : "Reunião cadastrada.");
    limparForm();
    porId("data").focus();
  }
});

porId("cancelar").addEventListener("click", () => {
  limparForm();
  porId("data").focus();
});

function baixar(nome, tipo, conteudo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function textoCsv(valor) {
  // Impede que temas sejam interpretados como fórmulas de planilha.
  const seguro = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(valor) ? "'" + valor : valor;
  return '"' + seguro.replaceAll('"', '""') + '"';
}

porId("csv").addEventListener("click", () => {
  const linhas = reunioes.map(({ data, hora, tema, quantidade }) =>
    [mostrarData(data), hora, textoCsv(tema), quantidade].join(";"));
  baixar("reunioes.csv", "text/csv;charset=utf-8",
    "\uFEFF" + ["Data;Horário;Tema;Quantidade de participantes", ...linhas].join("\r\n") + "\r\n");
});

porId("backup").addEventListener("click", () => {
  baixar("backup-reunioes.json", "application/json", serializar(reunioes));
});

porId("importar").addEventListener("click", () => arquivo.click());
arquivo.addEventListener("change", async () => {
  const selecionado = arquivo.files[0];
  arquivo.value = "";
  if (!selecionado) return;
  let registros;
  try {
    registros = lerBackup(await selecionado.text());
  } catch {
    informar("Backup inválido ou ilegível. Selecione um arquivo JSON exportado pelo sistema.", true);
    return;
  }
  if (!confirm("Importar este backup com " + registros.length + " registro(s)? Os dados atuais serão substituídos.")) return;
  if (gravar(registros)) {
    limparForm();
    informar("Backup importado.");
  }
});

try {
  const salvos = localStorage.getItem(chave);
  if (salvos !== null) reunioes = lerBackup(salvos);
} catch {
  leituraFalhou = true;
  informar("Não foi possível ler os registros locais. Verifique as permissões do navegador ou restaure um backup JSON.", true);
}
renderizar();
