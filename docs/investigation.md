# Investigacao RHID

Este documento orienta como descobrir, com segurança, as chamadas usadas pelo RHID para lista de funcionários, data de admissão e banco de horas.

## Objetivo

Mapear as chamadas que carregam:

- lista de funcionários;
- identificador interno do funcionário;
- data de admissão;
- saldo ou banco de horas;
- geração/download de PDF do relatório.

## Como investigar no DevTools

1. Acesse `https://www.rhid.com.br/`.
2. Abra o DevTools com `F12`.
3. Vá para a aba **Network**.
4. Ative **Preserve log**.
5. Filtre por **Fetch/XHR**.
6. Faça login normalmente.
7. Navegue para `https://www.rhid.com.br/v2/#/list/person`.
8. Procure chamadas com nomes parecidos com:
   - `person`
   - `people`
   - `employee`
   - `funcionario`
   - `colaborador`
   - `usuario`
   - `admission`
   - `empresa`
9. Abra cada chamada candidata e registre:
   - método HTTP;
   - URL sem tokens sensíveis;
   - query params;
   - payload;
   - formato da resposta;
   - campos que parecem conter nome, ID e admissão.
10. Navegue para `https://www.rhid.com.br/v2/#/ponto_diario`.
11. Selecione um funcionário e um intervalo curto.
12. Procure chamadas com nomes parecidos com:
    - `ponto`
    - `daily`
    - `time`
    - `timesheet`
    - `bank`
    - `saldo`
    - `hour`
    - `report`
    - `pdf`

## O que procurar nas respostas

Campos comuns para funcionários:

- `id`
- `personId`
- `employeeId`
- `name`
- `nome`
- `pis`
- `cpf`
- `admissionDate`
- `dataAdmissao`
- `dtAdmissao`

Campos comuns para banco de horas:

- `balance`
- `saldo`
- `saldoBancoHoras`
- `hourBank`
- `bancoHoras`
- `workedHours`
- `expectedHours`
- `periodStart`
- `periodEnd`

## Cuidados com dados sensíveis

- Não salve HAR completo sem necessidade: ele pode conter cookies, tokens e dados pessoais.
- Se precisar salvar amostras, anonimize nomes, CPF, PIS, e-mails e IDs antes de commitar.
- Nunca copie `Authorization`, `Cookie`, `Set-Cookie` ou tokens para código.
- Prefira documentar o formato da chamada com placeholders, por exemplo:

```http
GET https://www.rhid.com.br/api/.../person?page=1
Authorization: Bearer <TOKEN_DA_SESSAO>
```

## Hipóteses para testar

- A limitação de 3 meses pode estar só na UI.
- A limitação de 3 meses pode existir no backend.
- O PDF pode ser gerado por endpoint separado de relatório.
- A data de admissão pode estar em detalhes do funcionário, não na listagem.

## Próximos passos após descobrir endpoints

1. Criar cliente de API usando a sessão autenticada do Playwright.
2. Buscar todos os funcionários com paginação.
3. Buscar detalhes de cada funcionário para obter data de admissão.
4. Dividir o período desde a admissão em meses.
5. Consultar banco de horas por funcionário/mês.
6. Baixar PDF quando disponível.
7. Salvar somente em `exports/` ou `downloads/`, que estão ignorados pelo Git.

## Endpoints encontrados

### Autenticação

```http
POST https://www.rhid.com.br/v2/login.svc/
```

A resposta contém `accessToken`. A aplicação salva esse token em `localStorage` e usa:

```http
Authorization: Bearer <TOKEN_DA_SESSAO>
X-Cid-RHiD: <ID_DO_CLIENTE>
```

### Funcionários

Lista da tela:

```http
GET https://www.rhid.com.br/v2/customerdb/person.svc/a_status/ativo?...start=0&length=10...
```

Lista ativa usada em filtros:

```http
GET https://www.rhid.com.br/v2/customerdb/person.svc/a_ativo
```

Campos observados incluem `id`, `name`, `admissionDate`, `admissionDateStr`, `companyTradingName`, `departmentName` e vários campos pessoais. Não commitar respostas completas.

### Banco de horas por data

```http
GET https://www.rhid.com.br/v2/customerdb/person.svc/person_banco_horas?date=YYYYMMDD
```

Campos relevantes observados:

- `inicioBancoHoras`
- `inicioBancoHorasStr`
- `saldoBancoFinalDia`
- `saldoBancoHoras`
- `saldoBancoHorasAjustado`
- `saldoNegativoBancoHoras`
- `saldoPositivoBancoHoras`

Os saldos são numéricos e aparentam estar em minutos. Esse endpoint respondeu também para datas anteriores a 3 meses nos testes.

### Relatório de extrato de banco de horas

Geração:

```http
POST https://www.rhid.com.br/v2/report.svc/ponto
```

Payload mínimo observado:

```json
{
  "pdfCartaoPontoParameters": {
    "listCompanyStr": [],
    "listDepartmentStr": [],
    "listCostCenterStr": [],
    "listPersonRoleStr": [],
    "listIdStr": ["<ID_FUNCIONARIO>"],
    "listShiftStr": []
  },
  "ini": "YYYYMMDD",
  "fim": "YYYYMMDD",
  "formatoSaida": "PDF",
  "saldoBanco": "TODOS",
  "relatorio": "extrato_banco_horas",
  "status": 1
}
```

Status:

```http
GET https://www.rhid.com.br/v2/customerdb/notify.svc/specificGuid/?guid=<GUID>
```

Download:

```http
POST https://www.rhid.com.br/v2/customerdb/notify.svc/save_file/?format=PDF&guid=<GUID>
```

Observação: o JavaScript da interface limita o relatório de `extrato_banco_horas` a um mês quando há mais de um funcionário selecionado. Para períodos longos, gerar por funcionário e por mês é a abordagem mais segura.

Na prática, esse relatório nativo não deve ser usado como fonte principal para a apuração completa: em testes ele gerou PDFs zerados para períodos em que a tela de manutenção mostrava horas normais, faltas e extras. A fonte principal do projeto passou a ser `apuracao_ponto_salva_tabela`.

### Manutenção de ponto

A tela `https://www.rhid.com.br/v2/#/manutencao_ponto` usa:

```http
POST https://www.rhid.com.br/v2/report.svc/apuracao_ponto_salva_tabela
```

Payload mínimo:

```json
{
  "idPerson": ["<ID_FUNCIONARIO>"],
  "ini": "YYYYMMDD",
  "fim": "YYYYMMDD",
  "afdChanges": [],
  "alertId": [],
  "pagina": 1
}
```

Campos úteis retornados:

- `dateTimeStr`
- `idPerson`
- `name`
- `listAfdtManutencao`
- `horasTotalNaoExtra`
- `horasTotalNoturno`
- `horasFaltaAtraso`
- `minutosAbono`
- `extraDiurna`
- `extraNoturna`
- `saldoBancoAjustado`
- `saldoBancoFinalDia`
- `totalHorasTrabalhadas`
- `faltaDiaInteiro`
- `folga`
- `holiday`

Esse endpoint é melhor para CSV/auditoria do que o PDF, porque traz a estrutura diária em JSON. Nos testes, períodos de cerca de 3 meses funcionaram; períodos muito maiores retornaram erro HTTP 400.

Os PDFs finais em `downloads/` são gerados localmente a partir desse JSON, com prefixo `apuracao_ponto_`. O saldo calculado no relatório local usa:

```text
saldo_dia = extraDiurna + extraNoturna - horasFaltaAtraso
```

O campo original `saldoBancoFinalDia` também é mantido no CSV como `saldo_banco_rhid`, pois pode vir zerado dependendo da configuração/relatório do RHID.
