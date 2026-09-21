# RHID Attendance Exporter

Projeto de investigação autorizada para descobrir as chamadas usadas pelo RHID e automatizar, com segurança, a coleta de ponto e banco de horas dos funcionários.

## Cuidados

- Não coloque usuário, senha, cookies, tokens ou PDFs reais no Git.
- Use somente acesso autorizado da empresa.
- Não compartilhe arquivos de `exports/`, `downloads/`, `logs/` ou `.auth/` sem revisar dados pessoais.
- Não adicione arquivos compactados: eles podem contornar a revisão visual e carregar relatórios ou dados pessoais.
- Se uma credencial foi exposta em chat, issue, commit ou print, troque a senha antes de seguir.

## Stack sugerida

- Node.js + TypeScript
- Playwright com Chromium
- `.env` para credenciais

Essa stack facilita investigar SPAs com rotas `#/...`, capturar chamadas de rede e automatizar downloads quando a rotina exata for conhecida.

## Instalação

```bash
npm install
npm run install:browsers
```

Crie o arquivo `.env` a partir de `.env.example`:

```bash
cp .env.example .env
```

Preencha:

```env
RHID_EMAIL=
RHID_PASSWORD=
HEADLESS=false
RHID_BASE_URL=https://www.rhid.com.br
```

## Comandos

Investigar chamadas da aplicação enquanto navega:

```bash
npm run investigate
```

Extrair uma primeira amostra de funcionários visíveis e respostas de rede relacionadas:

```bash
npm run employees
```

Listar endpoints XHR/Fetch vistos nas telas principais, sem gravar dados reais:

```bash
npm run endpoints
```

Acessar a tela de ponto diário por intervalo:

```bash
npm run ponto -- --employee-id ID_DO_FUNCIONARIO --start 2026-01-01 --end 2026-01-31
```

Exportar snapshot de banco de horas em uma data:

```bash
npm run hour-bank -- --date 2026-05-20
```

Gerar e baixar PDF de extrato de banco de horas para um funcionário:

```bash
npm run report-hour-bank -- --employee-id ID_DO_FUNCIONARIO --start 2026-01-01 --end 2026-01-31
```

Esse comando usa o relatório nativo `extrato_banco_horas` do RHID. Ele foi mantido para investigação, mas não é a fonte principal, porque pode sair zerado mesmo quando a tela de apuração mostra faltas e extras.

Exportar a tabela rica da tela `#/manutencao_ponto` para CSV:

```bash
npm run maintenance-csv -- --employee-id ID_DO_FUNCIONARIO --start 2026-01-01 --end 2026-03-31
```

Exportar todos os funcionários desde a admissão, criando CSVs e PDFs próprios a partir da tela `#/manutencao_ponto`:

```bash
npm run export-all -- --csv-days 93 --pdf-days 366
```

Opções úteis:

```bash
npm run export-all -- --employee-id ID_DO_FUNCIONARIO --csv-days 93 --pdf-days 366
npm run export-all -- --skip-pdf
npm run export-all -- --skip-csv
npm run export-all -- --until 2026-05-20
```

Os scripts atuais são investigativos. Eles evitam gravar respostas completas por padrão para reduzir risco de vazamento de dados pessoais. Depois de identificar os endpoints corretos, a próxima etapa é transformar a captura em clientes de API com paginação, filtros por funcionário e downloads mensais.

## Descobertas atuais

- Login: `POST /v2/login.svc/`
- Lista de funcionários ativos: `GET /v2/customerdb/person.svc/a_status/ativo?...`
- Lista ativa simples: `GET /v2/customerdb/person.svc/a_ativo`
- Banco de horas por data: `GET /v2/customerdb/person.svc/person_banco_horas?date=YYYYMMDD`
- Dados ricos da tela Manutenção de Ponto: `POST /v2/report.svc/apuracao_ponto_salva_tabela`
- Geração de relatório: `POST /v2/report.svc/ponto`
- Status do processamento: `GET /v2/customerdb/notify.svc/specificGuid/?guid=<GUID>`
- Download do arquivo: `POST /v2/customerdb/notify.svc/save_file/?format=PDF&guid=<GUID>`

O endpoint de banco de horas aceitou datas antigas nos testes, então a trava de 3 meses parece existir na interface de apuração, não nesse endpoint específico. O endpoint de manutenção retorna dados diários bem mais completos, mas falha em períodos longos; por isso `export-all` usa blocos de 93 dias por padrão. Os PDFs finais são gerados localmente a partir desses mesmos dados da manutenção, com saldo do dia calculado como `extra diurna + extra noturna - falta/atraso`.

## Fluxo recomendado

1. Rode `npm run investigate` com `HEADLESS=false`.
2. Faça login e navegue até `#/list/person`.
3. Observe no terminal as chamadas que parecem carregar funcionários.
4. Vá até `#/ponto_diario`, filtre um funcionário e intervalo pequeno.
5. Anote endpoints, métodos, payloads e parâmetros em `docs/investigation.md`.
6. Use `npm run hour-bank` para snapshots de saldo e `npm run report-hour-bank` para gerar PDFs.

## Limitações conhecidas

- A interface pode limitar consultas aos últimos 3 meses. Se o backend também bloquear períodos antigos, será necessário pedir ao fornecedor RHID exportação oficial ou liberação de endpoint/relatório histórico.
- Seletores da tela podem mudar. Por isso o projeto prioriza capturar chamadas de rede e só usa automação visual como apoio.
- Relatórios muito longos devem ser particionados por funcionário e por mês para reduzir risco de bloqueio, timeout ou fila excessiva.
