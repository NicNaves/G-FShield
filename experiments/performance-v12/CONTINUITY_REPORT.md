# Continuidade: performance-v12

Nota nesta branch v13: o trabalho atual esta em
[performance-v13/STATUS.md](../performance-v13/STATUS.md).
O texto abaixo preserva o estado historico da v12.

Atualizado em 2026-09-23. Branch: experiment/performance-v12.
Estado mais recente: [auditoria do piloto](STATUS_2026-09-23.md).
V11 concluida e analisada; piloto v12 concluido, nove celulas validas.
Preservar o checkout congelado do servidor, commit e551db2.
Worktree: C:/Users/Rider V/Downloads/G-FShield/.worktrees/performance-v12.
Base: 92c7ec0. Remoto: https://github.com/NicNaves/G-FShield.git.
Commit das otimizacoes e testes Weka: 47fb14c.

## Progresso confirmado

- Corrigida a consulta de PID do lock no Windows: OpenProcess/WaitForSingleObject,
  sem os.kill(pid, 0). A chamada antiga podia emitir CTRL_C_EVENT e fechar Codex.
  Commit da correcao: 7c70130. Teste de regressao aprovado sem enviar sinais.
- Memoizacao exata e opcional, limitada atomicamente, com espera por avaliacao
  concorrente identica, copia defensiva e remocao de falhas.
- Chave inclui identidade de execucao, conteudo dos dados, parametros efetivos
  do classificador e subconjunto. Identificador de telemetria SHA-256.
- Busca de substituicao paralela opcional com classificador independente,
  desempate em ordem e tratamento de cancelamento. Coletores encerrados em finally.
- Telemetria separa trained, memoized e unclassified; resultados registram flags.
- Runner v12 separado preserva o arquivo/execucao v11 e verifica recursos,
  hashes, imagens, piloto e teto temporal. Protocolo: 99 celulas formais.
- Testes Weka reais em dados sinteticos verificaram resultados exatamente iguais
  nas quatro combinacoes locais (paralelismo 1/3 x memoizacao desligada/ligada).
  Isso comprova esses casos de regressao, nao ganho de desempenho em IDS.

## Ambiente de validacao local

JDK portatil Temurin 17.0.20.1+1, obtido da API oficial Adoptium e verificado.
SHA-256 do ZIP: e53a79c3c3d86865bd7e787903884331068e71321714ffd44f145785affc7cb0.
JAVA_HOME temporario: C:/Users/Rider V/AppData/Local/Temp/gfshield-v12-jdk17/jdk-17.0.20.1+1.
Nao alterado o Java global do usuario. Maven wrapper do proprio modulo.
Relatorios Java: target/surefire-reports do modulo IWSSR: 13 testes aprovados,
zero falhas/erros/skips, incluindo IDs SHA-256 e todos os ajustes finais Java.
Suite Python atual: 73 aprovados no Windows; no servidor Linux, 73 executados
sem falha e com 1 skip esperado (regressao especifica de Windows).
`git diff --check` aprovado; o `--help` do runner v12 foi executado.

## Servidor: ultima consulta efetiva

2026-09-23 04:15 UTC: piloto PILOT_COMPLETED, 9/9, nove tentativas validas.
Conclusao: 2026-09-23T02:57:02.553148+00:00; auditoria repetida sem erros.
Nao restaram conteineres experimentais ativos. Formal ainda nao iniciada.
Neste piloto de uma semente, o F1 do monolito foi maior. Nao selecionar
configuracoes pelo teste; ver todos os bracos no relatorio mais recente.

Historico anterior:
2026-09-23 aproximadamente 01:01 UTC: v11 CAMPAIGN_COMPLETED, 100/100,
25 por braco, zero tentativas invalidas. Conclusao: 2026-09-21T21:30:12 UTC.
Estado: /home/idscps/nicolas/experiment-artifacts/pipeline-ablation/formal-v11/state.json.
Acesso SSH autorizado: idscps@200.156.91.194, porta 2289.
Credenciais nao registradas neste arquivo.

Seis imagens v12 construidas com tag performance-v12-e551db2. Piloto iniciado
em 2026-09-23T01:00:27 UTC, na sessao tmux gfshield-v12-pilot. Estado em
/home/idscps/nicolas/experiment-artifacts/performance-v12/pilot/state.json.
O commit congelado do piloto e e551db23a6be73542d8284ddf942564f8426b35b.
Documentacao posterior no Git nao deve mudar o checkout ativo do servidor.
A v11 nao confirmou a hipotese primaria de escalabilidade (p=0,216439).
Seu maior throughput veio acompanhado de maior CPU/RAM. Ver relatorio completo.

## Proximos marcos

1. Piloto concluido e auditado; consultar STATUS_2026-09-23.md.
2. Preservar commit/imagens/manifesto congelados; o checkout v11 permanece intacto.
3. Auditoria tecnica das nove celulas aprovada; concluir analise antes da formal.
4. Auditar equivalencia/flags/telemetria, completude de artefatos, limites reais,
   fila, overhead e cancelamento. Repetir piloto se houver mudanca no codigo.
5. Implementar analise fatorial v12 e completar instrumentacao pendente antes
   das conclusoes estatisticas. Nao reutilizar conclusoes automaticas do v11.
6. Campanha formal de 99 celulas (sementes 128-138), limite global 10 dias.
7. Atualizar PT/EN somente com evidencias observadas, inclusive perdas e limites.

Ver README.md e protocol.json para comandos, fatores, metricas e limitacoes.
Existem resultados piloto v12; eles nao demonstram superioridade.
