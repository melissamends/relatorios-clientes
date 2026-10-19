# Relatório Online — MVP

Estrutura inicial para publicar relatórios individuais por cliente.

## Como editar
Abra:
`clientes/sfi-matriz/data.js`

Você altera:
- cliente/unidade
- período
- plataforma
- métricas
- resumo executivo
- leitura de performance
- insights
- próximos passos

O `index.html` lê tudo automaticamente.

## Como publicar no GitHub Pages
1. Crie um repositório.
2. Envie a pasta `clientes`.
3. Ative GitHub Pages.
4. O relatório ficará em algo parecido com:
   `https://SEUUSUARIO.github.io/NOME-DO-REPOSITORIO/clientes/sfi-matriz/`

## Próxima fase
Trocar o arquivo `data.js` por uma leitura automática de Google Sheets.
Assim você atualiza os números na planilha e o relatório muda sozinho.


## Conectar ao Google Sheets
1. Na planilha Google Sheets, vá em **Arquivo > Compartilhar > Publicar na Web**.
2. Escolha apenas a aba **Relatorio**.
3. Escolha o formato **Valores separados por vírgulas (.csv)**.
4. Clique em **Publicar** e copie o link gerado.
5. Abra `clientes/sfi-matriz/config.js`.
6. Substitua `COLE_AQUI_O_LINK_CSV` pelo link CSV.
7. Publique a pasta no GitHub Pages.

Depois disso, o site passa a buscar os dados da planilha a cada abertura.
