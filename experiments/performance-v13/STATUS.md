# Continuidade e agendamento - performance v13

Atualizado em 26/09/2026: campanha e analise offline CONCLUIDAS.
Formal: 100/100 execucoes, 20 sementes por braco, finalizada as 10:31:20 de Brasilia.
Piloto: 5/5 concluidas. Nenhum experimento adicional iniciado nesta analise.
Relatorio atual: [ANALISE_RESULTADOS.md](ANALISE_RESULTADOS.md).
Dados derivados: [evidence/analysis-20260926](evidence/analysis-20260926/REPORT.md).
Branch publicada: experiment/performance-v13.
Worktree local: C:/Users/Rider V/Downloads/G-FShield/.worktrees/performance-v12
(o nome da pasta e historico; a branch atual e v13).
Preservar o checkout de execucao congelado e os artefatos brutos.
Analise executada em checkout separado G-FShield-analysis-v13, commit b2fc64a.

## Implementado nesta rodada

- Publicacao antecipada opcional de melhorias de adicao/substituicao IWSSR.
  O envio ocorre apos a avaliacao terminar, sem aguardar toda a vizinhanca.
  Snapshots separados, marca maxima por busca, bloqueio de resultados tardios.
  A reducao ordenada que decide a proxima iteracao foi preservada.
- Limite compartilhado opcional de avaliacoes efetivas no processo IWSSR:
  semaforo justo, respeito ao prazo na admissao, liberacao mesmo em falhas.
  O limite cobre projecao, treinamento e validacao; nao e um limite global
  entre maquinas ou um mecanismo de limite de CPU do sistema operacional.
- Registro de flags efetivas, admissoes, pico de concorrencia e publicacoes.
  A espera agregada aparece no encerramento do servico quando este e gracioso;
  nao presumir que essa linha sempre exista apos encerramento forcado.
- Opcoes Docker/CLI, validacao de Compose e logs em cada celula.
- Encadeamento explicito piloto -> auditoria tecnica -> campanha formal,
  com um unico prazo global. Um erro tecnico interrompe a sequencia.
- Padroes anteriores preservados: publicacao antecipada OFF, limite 0.
  O cache de resultados fica OFF em todos os bracos v13; o cache de leitura
  dos datasets congelados continua habilitado no distribuido.

## Testes e versao congelada

Commit de codigo/protocolo: 5ad942cd22360231d4d2a9e968ad91c1bc9b9a19.
Commit enviado ao GitHub antes do inicio.

- Windows: 81 testes Python aprovados.
- Windows: 19 testes Java aprovados, zero falhas/erros/skips.
- Linux: 81 testes Python executados, zero falhas, um skip esperado de Windows.
- Testes verificam equivalencia da busca completa com Weka em dados sinteticos,
  teto de concorrencia, expiracao sem treinamento, liberacao em falha,
  publicacao antes do fim da vizinhanca, rejeicao tardia, copias defensivas
  e bloqueio da formal em falha de piloto/auditoria/conteiner sobrevivente.
- Esses testes nao comprovam ganho de desempenho ou equivalencia universal.
- Python global do servidor nao tem numpy/matplotlib; a suite foi executada
  novamente no ambiente de analise existente e passou. O runner usa biblioteca
  padrao e continua com python3.
- Log Java local: tmp/v13-java-tests.log.
- Log Python servidor:
  /home/idscps/nicolas/experiment-artifacts/performance-v13/python-tests-venv.log.

## Execucao confirmada no servidor

Checkout dedicado: /home/idscps/nicolas/G-FShield-performance-v13.
Artefatos: /home/idscps/nicolas/experiment-artifacts/performance-v13.
Sessao tmux usada: gfshield-v13-chain; encerrada ao concluir a campanha.
Tag de imagens: performance-v13-5ad942c.
Imagem IWSSR:
sha256:405fc5ae342a954cffaa31c98f11305763bae10e37722bcc3ccd6655a1640f3b.

O build das seis imagens terminou. Piloto iniciado em
2026-09-23T04:47:13.217133+00:00 (23/09, 01:47:13 de Brasilia).
O piloto foi aprovado e liberou a formal, agora CAMPAIGN_COMPLETED.
Fim formal: 2026-09-26T13:31:20.019078+00:00, 100 tentativas e 100 concluidas.
Foram verificados os 1.220 hashes dos artefatos; todos conferem.
SHA-256 do estado formal:
b502b622e8533dd2c70e11cd657d692566f042b4ff6c741e9da1fc7c7b8449b4.
Nao restaram conteineres experimentais nem sessao tmux da campanha na auditoria final.

Manifesto congelado do piloto:
8beb8af878e80ae3cdcee3b462902b76fd79844af971dee42840fd1fc2fa1393 (SHA-256).
Ele inclui commit, protocolo efetivo, hashes dos dados e IDs das imagens.

A formal foi liberada pela opcao --chain-formal apos as cinco celulas e seus
hashes/flags/telemetria passarem pela auditoria, sem conteiner experimental sobrevivente.
A verificacao nao escolhe configuracoes por F1; resultados desfavoraveis sao mantidos.
O teto global termina em 2026-10-03T04:47:13.217133+00:00, incluindo piloto.
Nao ha tentativas automaticas adicionais para uma celula tecnicamente invalida.

## Matriz

- Piloto: semente 149, cinco celulas; 600 s selecao + 300 s finalizacao cada.
- Formal: sementes 150-169, cinco bracos; 100 celulas.
- Formal por celula: 2700 s selecao + 300 s finalizacao.
- Bracos: monolito e quatro combinacoes early-progress OFF/ON x training-limit 0/3.
- Distribuido: pipeline 3, vizinhanca 3, memoizacao de avaliacoes OFF.
- Limite agregado: 6 CPUs / 12 GiB, cpuset 8-15, NUMA 1; Kafka/ZooKeeper incluidos.
- Ordem ciclica balanceada por posicao nas 20 sementes, sem balanceamento
  completo de efeitos de sequencia.
- Um monolito paralelo NAO faz parte deste protocolo.

## Acompanhamento

- piloto: performance-v13/pilot/state.json
- manifesto: performance-v13/pilot/frozen-manifest.json
- formal: performance-v13/formal/state.json (criado apenas apos liberacao)
- liberacao: performance-v13/schedule.json
- supervisor: performance-v13/supervisor.log
- build: performance-v13/build.log

Todos os caminhos acima sao relativos a
/home/idscps/nicolas/experiment-artifacts/.
Consultar state/attempts e final-result.json; nao inferir sucesso pelo fim do tmux.
Nao iniciar outra campanha, rebuildar imagens com a mesma tag ou atualizar o
checkout congelado. Uma retomada deve preservar os caminhos e prazo originais.
Atualizacoes posteriores de documentacao no Git nao devem ser puxadas no servidor.

## Analise concluida e proximos passos

Analisador fatorial e integracao temporal implementados e executados em 26/09.
93 testes Python locais aprovados; no Linux 93 executados, um skip, zero falhas.
Resultados: efeito do limite 3 positivo (p Holm=0,01171875), publicacao antecipada
nao confirmada (p Holm=0,1640625). Nao inferioridade de F1 sustentada individualmente
para os tres bracos modificados versus e0-b0. Frente ao monolito, maior vazao
observada mas tambem maior CPU/RAM; sem prova de superioridade geral.
Cobertura minima da integracao: 97,96% (limite de lacuna 120 s), ou 90,52%
na sensibilidade de 60 s. Relatorio detalha limitacoes e todos os bracos.

Checklist anterior, agora atendido nos itens 1-5; item 6 ainda pendente:

1. Auditar o piloto e acompanhar a liberacao automatica/estado da formal.
2. Concluir o analisador offline fatorial com dois efeitos principais, interacao,
   intervalos e correcao de Holm definidos em protocol.json.
3. Integrar CPU/RAM por timestamp e janela de selecao, relatando cobertura,
   lacunas e incerteza de amostragem, sem tratar mediana x duracao como integral.
4. Distinguir avaliacao concluida, envio pelo IWSSR, publicacao pelo verificador
   e consumo de BEST_SOLUTION_TOPIC. O JSON usa horario do verificador; os logs
   de confirmacao de consumo contem F1, particao e offset. O campo de tempo atual
   nao comprova sozinho latencia observada pelo cliente. Correlacoes ambiguas
   devem ser reportadas como ausentes, nao fabricadas.
5. Relatar todas as configuracoes e comparacoes negativas, preservando holdout.
6. Atualizar PT/EN apenas apos analise validada; nao houve edicao das dissertacoes
   nesta rodada.

Ainda nao implementados nesta rodada: reducao de copias/projecoes, coletor unico,
portfolio de buscas, multi-fidelidade, monolito paralelo, testes multihost/falhas.
Exigem ablacões e protocolos separados. Nao se afirma superioridade da v13.

V11: 100 execucoes, hipotese primaria nao confirmada.
V12: nove celulas piloto concluidas; F1 do monolito superior nesse piloto.
Os checkouts e resultados anteriores permanecem preservados.
