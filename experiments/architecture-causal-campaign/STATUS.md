# Estado da campanha causal de arquitetura

Atualizado em: 2026-09-04 (America/Sao_Paulo)

## Objetivo

Testar, sem pressupor o resultado, se a arquitetura distribuída do G-FShield
obtém candidatos de boa qualidade mais cedo que um monólito sequencial quando
ambos executam o mesmo GRASP-FS e recebem o mesmo teto agregado de recursos.

A hipótese arquitetural é específica: no G-FShield, a construção de uma nova
solução pode avançar enquanto buscas locais processam soluções anteriores. O
monólito conclui construção e busca local sequencialmente antes de iniciar a
próxima construção.

## Resultado que pode ser afirmado neste momento

A sobreposição de estágios foi observada no piloto v2: enquanto o IWSSR
processava a primeira solução, o RCL produziu as gerações seguintes. Também foi
observado uso simultâneo de aproximadamente um núcleo pelo RCL e um núcleo pelo
IWSSR. Isso comprova o mecanismo no piloto, mas ainda não comprova uma vantagem
estatística de velocidade ou eficiência.

Nenhuma conclusão final de superioridade deve ser escrita na dissertação antes
da conclusão e análise da campanha v9.

## Desenho formal congelado para a v9

- 30 sementes pareadas: 42 a 71.
- Ordem AB/BA alternada: 15 pares começam pelo distribuído e 15 pelo monólito.
- Limite por execução: 3.000 s, com 300 s reservados à avaliação final.
- Limite global: 10 dias; até três tentativas por célula inválida.
- CPU: CPUs físicas 8--15, nó NUMA 1.
- Teto idêntico: 6 CPUs e 12 GiB por braço.
- Distribuído: três partições Kafka e três consumidores IWSSR.
- Monólito: fluxo sequencial original sob o mesmo teto agregado.
- Algoritmo: ReliefF, RCL 30, subconjunto inicial 5, VND, somente IWSSR,
  100 ciclos VND, 100 iterações IWSSR e melhoria mínima 0,0001.
- Classificador e objetivo: Weka J48 3.8.6 e F1 macro multiclasse.
- ReliefF: Weka 3.8.6, amostra 1.000 e mesma semente da execução.
- Dados: treino/validação/teste imutáveis; teste consultado uma vez depois da
  seleção por validação.
- Cache de treino habilitado no DLS para equivaler à carga única do monólito;
  isso não altera candidatos, classificadores ou transições.
- A janela primária começa no envio da requisição, depois de os serviços
  distribuídos estarem prontos. O tempo de implantação/cold start é preservado
  separadamente, mas não integra o teste do efeito de pipeline em regime ativo.
- Candidatos concluídos depois do prazo, durante o desligamento, são excluídos.
  Buscas ainda ativas são censuradas no último evento observado dentro da janela.

## Desfechos

Primário:

- diferença pareada no tempo até um candidato internamente avaliado atingir F1
  macro de validação 0,94, censurada em 2.700 s.

Salvaguarda de qualidade:

- limite inferior bootstrap unilateral de 95% para a diferença média pareada
  de F1 macro no teste (distribuído menos monólito) deve ser pelo menos -0,005.

Secundários:

- AUC normalizada da curva anytime;
- tempos até 0,93, 0,945 e 0,95;
- avaliações de candidatos por segundo;
- núcleos de CPU efetivamente utilizados segundo Docker;
- CPU-horas e GiB-horas estimadas por candidato;
- CPU-core-seconds estimados até 0,94;
- percentual do tempo de busca local sobreposto à construção;
- redução dimensional.

O teste primário usa permutação pareada com alfa 0,05. A família secundária
usa ajuste de Holm. Efeitos, intervalos de confiança, vitórias/empates/derrotas
e limites de validade devem acompanhar os valores de p.

## Paridade implementada

- O avaliador comum passou a fornecer ranking ReliefF determinístico.
- O monólito usa gerador compatível com `java.util.Random` e consome a mesma
  sequência usada para UUIDs e amostragem do RCL.
- O IWSSR do monólito replica os movimentos de adição e melhor remoção do Java.
- Ambos usam o caminho ativo de F1 macro; a alegação anterior de que a campanha
  Java usava apenas objetivo binário legado está incorreta e deve ser removida.
- O monólito separa avaliações de seleção da avaliação única de teste.
- Candidatos internos são timestampados nos dois braços; o primário não depende
  apenas da publicação intermediária no Kafka.
- A escrita do CSV IWSSR foi sincronizada para permitir três consumidores sem
  corrupção da telemetria.

## Evidência e problemas encontrados no piloto v2

- Commit no servidor: `dd6b4a7`.
- Tag: `experiment-architecture-causal-v2`.
- Imagens: sufixo `causal-dd6b4a7`.
- Primeiro ranking ReliefF da semente 42: aproximadamente 69--72 s.
- Primeira construção: aproximadamente 25 s, F1 macro 0,6891.
- O IWSSR começou a primeira busca logo após essa publicação.
- Durante a busca, o RCL publicou pelo menos as gerações 2 e 3.
- Uma amostra de `docker stats` mostrou RCL e IWSSR próximos de 100% de um
  núcleo cada, simultaneamente.
- Com somente um consumidor, as construções seguintes ficaram em fila. Esse
  gargalo motivou a configuração concorrente com três partições/consumidores,
  ainda dentro dos mesmos
  6 CPUs e 12 GiB.
- O caminho inicialmente configurado como `datasets/campaign-10d` estava
  incorreto; o caminho canônico é `datasets/campaign`. Os hashes já conferiram.
- Um link simbólico para os dados não funcionou dentro do bind mount Docker; o
  servidor passou a usar uma cópia local ignorada pelo Git com os mesmos hashes.
- O Python global do servidor não possui NumPy/Matplotlib. Isso não afeta os
  executores Docker. A análise pode ser feita localmente depois de baixar os
  artefatos, ou em ambiente Python isolado no servidor.
- O piloto v2 terminou com duas células válidas. Em 600 s de seleção, o braço
  distribuído de um consumidor obteve F1 de validação 0,922230 (29 avaliações
  registradas) e o monólito obteve 0,944423 (67 avaliações). Esses números são
  diagnósticos e não fazem parte da campanha formal.
- A primeira trajetória teve paridade exata. O subconjunto distribuído de base
  1 `[2, 8, 24, 37, 48]` corresponde ao subconjunto monolítico de base 0
  `[1, 7, 23, 36, 47]`; a primeira adição também correspondeu (22 versus 21) e
  produziu o mesmo F1 macro 0,852939.
- O CSV do RCL v2 continha apenas o cabeçalho porque o processo foi encerrado no
  prazo antes de fechar o buffer. A revisão posterior força `flush` após cada
  avaliação concluída para que a contagem de trabalho não seja subestimada.

## Evidência e correção metodológica do piloto v6

- Commit/tag: `4589edc`, `experiment-architecture-causal-v6`.
- As seis imagens foram compiladas; a troca de `PreDestroy` por `DisposableBean`
  resolveu a incompatibilidade do IWSSR com Spring Boot 2.7.5.
- Todos os tópicos relevantes tinham três partições, e as três threads IWSSR
  receberam partições diferentes e processaram sementes distintas.
- Em uma amostra simultânea, o RCL utilizou 99,56% de um núcleo e o IWSSR
  298,23% (aproximadamente três núcleos), confirmando execução concorrente.
- O CSV IWSSR observado tinha 27 linhas, todas com os mesmos 16 campos; o CSV
  ReliefF continha dados além do cabeçalho. Não houve corrupção estrutural.
- Resultado diagnóstico distribuído: F1 macro de validação 0,922302, teste
  0,922115 e 35 candidatos registrados.
- Resultado diagnóstico monolítico: F1 macro de validação 0,944231, teste
  0,944685, 68 candidatos e primeiro F1 de validação >= 0,94 em 394,031 s.
- Esses tempos não podem entrar na campanha formal. O relógio distribuído
  começava antes da implantação e aguardava Kafka/serviços ficarem saudáveis,
  enquanto o monólito iniciava quase imediatamente. Isso consumiu cerca de três
  minutos da janela distribuída e confundiu cold start com efeito de pipeline.
- A v7 corrige a origem temporal para o envio da requisição após prontidão,
  inicia a amostragem de recursos nesse ponto, ajusta timestamps internos pelo
  offset medido e registra o cold start em campo separado.
- O piloto v6 permanece preservado em
  `/home/idscps/nicolas/experiment-artifacts/architecture-causal/pilot-v6` e é
  evidência diagnóstica, não evidência inferencial de superioridade.

## Evidência e correções de censoramento do piloto v7

- Commit/tag: `bccfb97`, `experiment-architecture-causal-v7`.
- A prontidão consumiu 86,601 s e foi registrada separadamente. A janela de
  seleção distribuída passou a ter os 600 s completos do piloto.
- Resultado diagnóstico distribuído: F1 macro de validação 0,922302, teste
  0,922115, 45 registros de candidatos brutos e nenhum alcance de 0,94.
- Resultado diagnóstico monolítico: F1 macro de validação 0,944231, teste
  0,944685, 69 candidatos e alcance de 0,94 em 386,771 s.
- O piloto confirmou novamente buscas simultâneas, mas nenhuma busca IWSSR
  terminou integralmente antes do prazo curto. O analisador antigo exigia um
  evento `completed` e, por isso, não fechava os intervalos dessas buscas.
- Durante o desligamento gracioso, algumas avaliações em curso terminaram após
  o prazo. A contagem bruta e a curva antiga poderiam incluí-las no instante
  censurado, embora não tenham causado alcance de 0,94 neste piloto.
- A v8 conta e seleciona somente mensagens/candidatos com timestamp menor ou
  igual ao prazo, ignora pontos posteriores na curva anytime, registra a janela
  UTC exata e fecha buscas incompletas no último evento observado. Vazão e
  custos estimados de CPU/memória usam apenas a duração da seleção, sem somar
  a avaliação final em teste.
- O piloto v7 permanece preservado em
  `/home/idscps/nicolas/experiment-artifacts/architecture-causal/pilot-v7` e não
  integra a inferência formal.

## Validação do censoramento no piloto v8

- Commit/tag: `d051630`, `experiment-architecture-causal-v8`.
- O artefato transferido conferiu com SHA-256
  `683241bf7eb22b344f074b4daad1893651a8b774641f98eb350aa3db0cde7760`.
- A janela distribuída tinha 45 eventos internos brutos; 43 ocorreram dentro
  do prazo e dois durante o desligamento. O resultado registrou exatamente 43,
  demonstrando que o censoramento estrito funcionou.
- Resultado distribuído: F1 macro de validação 0,922302, teste 0,922115 e
  nenhum alcance de 0,94 em 600 s.
- Resultado monolítico: F1 macro de validação 0,944231, teste 0,944685 e
  alcance de 0,94 em 387,461 s.
- A análise diagnóstica mediu 88,94% de sobreposição no distribuído e 0%
  no monólito, com CPU mediana de 3,031 e 1,004 núcleos, respectivamente.
- A vazão foi 0,0717 candidato/s no distribuído e 0,1150 candidato/s no
  monólito; o custo estimado foi 0,011748 e 0,002425 CPU-h/candidato.
- Portanto, este piloto comprova o mecanismo de paralelismo, mas favorece o
  monólito em velocidade e eficiência para a semente/janela curta. Ele não
  autoriza uma afirmação de superioridade do G-FShield.
- A v9 não muda o algoritmo nem o comportamento no timeout. Ela registra o
  instante real de encerramento da seleção e usa essa duração para vazão e
  custos, cobrindo também eventual parada antecipada por 500 melhorias aceitas.

## Campanha formal v9 concluída

- Commit congelado: `7960791`.
- Tag Git: `experiment-architecture-causal-v9`.
- Tag das seis imagens experimentais: `causal-7960791`.
- Início UTC: `2026-09-04T00:32:45.436694+00:00`.
- Limite global UTC: `2026-09-14T00:32:45.436694+00:00`.
- Sessão persistente: `tmux` `gfshield-formal-v9`.
- Estado: `/home/idscps/nicolas/experiment-artifacts/architecture-causal/formal-v9/state.json`.
- Resultados: `/home/idscps/nicolas/experiment-artifacts/architecture-causal/formal-v9/results`.
- Log do supervisor: `/home/idscps/nicolas/experiment-artifacts/architecture-causal/formal-v9/runner.log`.
- O primeiro braço é o distribuído da semente 42. A requisição foi submetida
  após a prontidão dos serviços em `2026-09-04T00:34:45.783856+00:00`, com
  janela de seleção de 2.700 s.
- As imagens ativas foram conferidas como `causal-7960791`. A configuração
  resolvida confirmou três consumidores/partições e o teto agregado exato de
  6 CPUs e 12 GiB no `cpuset` 8--15.
- O piloto v9 de 300 s foi interrompido e preservado separadamente porque sua
  janela de seleção de 180 s não produziu uma solução distribuída completa.
  Ele não integra a análise. O piloto v8 de 600 s continua sendo a validação
  funcional do código, que é idêntico na v9.

### Resultado formal dos 30 pares

- A campanha terminou em `2026-09-05T23:43:22.086427+00:00`, com 60 braços
  válidos, 30 pares completos e código de saída zero. O arquivo de estado tem
  SHA-256 `7c98cef249be408fb32b9baa2bbce38d6c94473d3b3fb9c17c099a1aefc7c686`.
- Sete primeiras tentativas distribuídas falharam durante a inicialização do
  Kafka/ZooKeeper (sementes 44, 46, 51, 52, 53, 57 e 58). Todas foram repetidas
  com sucesso; apenas as 60 tentativas com contrato de artefatos válido entram
  na inferência. Nenhum manifesto das execuções válidas apresentou divergência.
- O desfecho primário rejeitou a hipótese de maior velocidade para uma única
  requisição. A diferença mediana pareada no tempo até F1 0,94 foi
  `+422,740 s` (distribuído menos monólito; IC bootstrap de 95% da mediana
  `283,275--755,227 s`), com 7 vitórias e 23 derrotas do distribuído e
  `p=0,000795`.
- A salvaguarda de qualidade ficou ligeiramente abaixo do limite: diferença
  média pareada de F1 no teste `-0,001759` e limite inferior bootstrap
  unilateral de 95% `-0,005615`, diante da margem de `-0,005`.
- O mecanismo arquitetural e a vazão foram confirmados. A sobreposição mediana
  foi `99,998%` contra `0%`, e a vazão mediana foi `0,1074` contra `0,0739`
  candidato/s. O distribuído venceu os 30 pares nesses dois desfechos; os
  valores de `p` ajustados por Holm foram `0,000055`.
- O ganho de vazão exigiu mais recursos: `4,076` contra `1,004` núcleos,
  `0,010875` contra `0,003821` CPU-h/candidato e `0,012366` contra `0,004904`
  GiB-h/candidato. Não há evidência de eficiência de recursos.
- O distribuído obteve F1 mediano de teste `0,945529`, contra `0,944699`, e
  redução dimensional mediana `78,43%`, contra `76,47%`. A diferença mediana
  de redução foi `+1,96` ponto percentual, com 18 vitórias e 12 empates.
- A conclusão correta é dimensional: o pipeline distribuído demonstrou maior
  vazão, paralelismo e redução dimensional, mas foi mais lento até a primeira
  solução com F1 0,94 e consumiu mais CPU e memória por candidato.

## Confirmação independente de rendimento de qualidade (v10)

A v9 gerou, de forma exploratória, a hipótese de que o paralelismo pode aumentar
o número de subconjuntos distintos de qualidade mais alta, mesmo sem reduzir a
latência da primeira solução em 0,94. Para evitar dupla utilização dos mesmos
dados, a v10 congela antes da execução:

- sementes independentes 72--101 e os mesmos dados, algoritmo, janela,
  classificador, teto de 6 CPUs/12 GiB e ordem AB/BA;
- desfecho primário: diferença pareada na contagem de subconjuntos de atributos
  distintos com F1 macro de validação pelo menos 0,945 em 2.700 s;
- teste unilateral pareado de permutação, alfa 0,05;
- a mesma salvaguarda de não inferioridade no teste e confirmação do mecanismo
  de sobreposição;
- telemetria de todos os candidatos, com subconjunto canônico, F1 e timestamp
  monotônico, nos dois braços;
- dependência do Kafka condicionada à saúde do ZooKeeper, para reduzir as
  falhas de inicialização observadas sem alterar a busca.

Esse experimento pode demonstrar vantagem arquitetural de rendimento de
qualidade, não apagar nem substituir o resultado desfavorável de latência da v9.

### Execução v10

- Commit e tag congelados: `5dec3b1700187bbbc0f13a1ece081979b90f4ff5` e
  `experiment-architecture-quality-yield-v10`.
- Tag das seis imagens: `quality-5dec3b1`.
- Worktree isolado no servidor:
  `/home/idscps/nicolas/G-FShield-quality-yield-v10`.
- O piloto da semente 72 terminou em `PILOT_COMPLETED`, com dois braços válidos,
  dois manifestos íntegros e código de saída zero. O distribuído apresentou
  32 candidatos no resultado e 32 eventos no rastro; o monólito, 49 e 49.
  Todos os eventos ficaram dentro da janela de seleção. Os rastros continham,
  respectivamente, 30 e 44 subconjuntos distintos. A janela curta não produziu
  candidato com F1 de validação 0,945 e serve somente para validar a
  instrumentação, não para testar a hipótese.
- A campanha formal começou em `2026-09-06T20:26:38.367523+00:00`, com limite
  global em `2026-09-16T20:26:38.367523+00:00`.
- Sessão persistente: `tmux` `gfshield-quality-formal-v10`.
- Estado:
  `/home/idscps/nicolas/experiment-artifacts/architecture-quality-yield/formal-v10/state.json`.
- Resultados:
  `/home/idscps/nicolas/experiment-artifacts/architecture-quality-yield/formal-v10/results`.
- Log e saída do supervisor ficam em `runner.log` e `runner.exit` na mesma
  pasta. O primeiro braço, distribuído da semente 72, iniciou com Kafka e
  ZooKeeper saudáveis.
- Não executar outra campanha intensiva no mesmo `cpuset` enquanto a v10 estiver
  ativa. Estudos de concorrência e scale-out devem começar somente depois de
  seu término para não contaminar CPU, memória e tempo.

### Fotografia intermediária não inferencial (sementes 42--50)

- Em `2026-09-04T15:00:29Z`, havia 18 braços válidos, formando nove pares
  completos, e 20 tentativas registradas. Duas tentativas distribuídas
  (sementes 44 e 46, tentativa 1) falharam antes da medição por indisponibilidade
  transitória do ZooKeeper durante a inicialização do Kafka; as repetições
  correspondentes terminaram válidas e somente elas integram a amostra.
- Uma fotografia somente dos pares completos foi transferida e conferida com
  SHA-256 `2f0c3d0696e247ee45855fb5c90bf5c9b95e642eaad642dc7eada06f50dc1b5b`.
  A cópia derivada foi marcada localmente como piloto exclusivamente para o
  analisador bloquear qualquer conclusão inferencial antes dos 30 pares.
- Nos nove pares, o distribuído atingiu F1 macro de validação 0,94 em oito
  execuções e o monólito em nove. A diferença mediana pareada do tempo censurado
  (distribuído menos monólito) foi `+554,133 s`, portanto desfavorável ao
  distribuído neste recorte.
- A mediana de vazão foi maior no distribuído (`0,1170` contra `0,0785`
  candidato/s), e a sobreposição mediana entre construção e busca local foi
  `100,00%` contra `0,00%`. Isso sustenta provisoriamente o mecanismo de
  pipeline, não uma vantagem end-to-end.
- O custo mediano estimado foi maior no distribuído: `0,009840` contra
  `0,003554` CPU-h/candidato. O uso mediano foi `4,111` contra `1,004` núcleos.
- As medianas de F1 macro no teste foram `0,944729` e `0,944747`, mas o limite
  inferior bootstrap unilateral preliminar para a diferença média pareada foi
  `-0,019241`, abaixo da margem de `-0,005`. A semente 49 distribuída não
  alcançou 0,94 e terminou com F1 de teste `0,885327`; checksums, janela e
  telemetria da execução são válidos, logo ela não pode ser descartada.
- Esses valores são diagnósticos parciais, sujeitos às 21 sementes pareadas
  restantes. Não devem ser transportados para as tabelas finais nem usados para
  declarar significância, não inferioridade ou superioridade arquitetural.

## Identificadores e caminhos

Worktree local:

`C:\Users\Rider V\Downloads\G-FShield\.worktrees\experiment-10-day-campaign`

Branch local:

`experiment/architecture-causal`

Histórico relevante:

- `a75d8a6`: campanha causal pareada e instrumentação inicial;
- `dd6b4a7`: correção do caminho canônico dos dados;
- `fcff0f5`: pipeline concorrente e telemetria interna equivalente;
- `0275cce`: identidade v4 e primeira versão deste relatório;
- `b3bc392`: persistência imediata das métricas RCL e identidade v5;
- `4589edc`: troca `jakarta.annotation.PreDestroy`, incompatível com Spring
  Boot 2.7.5, por `DisposableBean` e congela a identidade/tag v6;
- `bccfb97`: corrige a origem temporal da janela causal e congela a identidade
  v7;
- `d051630`: aplica o censoramento estrito, trata buscas locais incompletas e
  congela a identidade/tag v8;
- a revisão v9 registra a duração efetiva da seleção, inclusive em eventual
  parada antecipada, e usa essa duração nos denominadores de vazão e custo.

Servidor autorizado pelo usuário:

- repositório principal: `/home/idscps/nicolas/G-FShield` (sujo; não alterar);
- campanha anterior: `/home/idscps/nicolas/G-FShield-experiment-10d`;
- worktree isolado: `/home/idscps/nicolas/G-FShield-architecture-causal`;
- artefatos: `/home/idscps/nicolas/experiment-artifacts/architecture-causal`;
- piloto v2: `/home/idscps/nicolas/experiment-artifacts/architecture-causal/pilot-v2`.
- piloto v6: `/home/idscps/nicolas/experiment-artifacts/architecture-causal/pilot-v6`.
- piloto v7: `/home/idscps/nicolas/experiment-artifacts/architecture-causal/pilot-v7`.
- piloto v8: `/home/idscps/nicolas/experiment-artifacts/architecture-causal/pilot-v8`.

As credenciais do servidor não devem ser registradas no repositório.

## Estado de versionamento

`d051630` é o estado validado pelo piloto v8. A revisão v9 preserva o algoritmo,
o orçamento e o censoramento já validados; acrescenta somente metadados da
duração efetiva de seleção e corrige os denominadores de vazão, CPU e memória
para essa duração. O analisador aceita pilotos somente com a opção explícita
`--allow-pilot`, evitando tratá-los acidentalmente como evidência inferencial.

Os bundles locais `architecture-causal-*.bundle` são artefatos temporários e
não devem ser adicionados ao Git.

## Próximos passos obrigatórios

1. Monitorar a campanha formal sem alterar o commit, as imagens, o protocolo ou
   o servidor de produção; investigar somente tentativas inválidas registradas
   no estado retomável.
2. Confirmar a conclusão válida dos 60 braços (30 pares), sem promover pilotos
   ou tentativas inválidas à amostra inferencial.
3. Baixar uma cópia dos artefatos, verificar os manifestos SHA-256 e executar
   `analyze_results.py` contra a raiz formal.
4. Interpretar primeiro o desfecho primário e a salvaguarda de qualidade. Uma
   vantagem só pode ser alegada se ambos forem satisfeitos e a telemetria
   confirmar o mecanismo concorrente.
5. Atualizar dissertações PT/EN e recriar tabelas/gráficos apenas com o resultado
   observado; se a hipótese não for sustentada, relatar o resultado nulo ou
   desfavorável sem reformular retroativamente o critério.

## Condição para alegar melhoria arquitetural

A dissertação poderá afirmar suporte à vantagem arquitetural somente se:

1. o tempo primário favorecer o distribuído com o teste pré-especificado;
2. a salvaguarda de não inferioridade de F1 no teste for satisfeita;
3. os logs confirmarem sobreposição real no distribuído e ausência no monólito;
4. artefatos, hashes, recursos e paridade algorítmica forem válidos.

Caso uma dessas condições falhe, o texto deve relatar que a campanha não
estabeleceu a vantagem, apresentando os resultados descritivos e a limitação.
