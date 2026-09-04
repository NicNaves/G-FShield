# Estado da campanha causal de arquitetura

Atualizado em: 2026-09-03 (America/Sao_Paulo)

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

1. Executar os 54 testes locais novamente.
2. Criar o commit e a tag `experiment-architecture-causal-v9`.
3. Gerar e enviar um novo bundle ao servidor.
4. Fazer fast-forward do worktree isolado; não tocar no repositório principal
   sujo nem nos contêineres de produção.
5. Validar `docker compose config`, conferindo três partições/consumidores e a
   soma de 6 CPUs/12 GiB.
6. Recompilar as seis imagens com um sufixo derivado do commit v9.
7. Executar uma validação pareada curta em diretório `pilot-v9`, destinada a
   verificar os novos campos de duração e o analisador, sem reutilizar o piloto
   como evidência formal.
8. Confirmar no piloto:
   - três buscas IWSSR simultâneas com seeds/candidatos distintos;
   - ausência de corrupção no CSV;
   - igualdade do primeiro subconjunto e F1 entre os braços, ajustando índices
     Java de base 1 para Python de base 0;
   - presença de `campaignElapsedMs`, intervalos de fase, resultados finais,
     amostras de recursos e checksums;
   - nenhuma exceção, OOM, reinício ou timeout de polling Kafka.
9. Somente depois iniciar a campanha formal v9 em `tmux`, com estado/resultados
   separados e retomáveis.
10. Ao terminar, baixar uma cópia dos artefatos, verificar checksums, executar
    `analyze_results.py` e interpretar o critério pré-especificado.
11. Atualizar dissertações PT/EN e gráficos apenas com o resultado observado.

## Condição para alegar melhoria arquitetural

A dissertação poderá afirmar suporte à vantagem arquitetural somente se:

1. o tempo primário favorecer o distribuído com o teste pré-especificado;
2. a salvaguarda de não inferioridade de F1 no teste for satisfeita;
3. os logs confirmarem sobreposição real no distribuído e ausência no monólito;
4. artefatos, hashes, recursos e paridade algorítmica forem válidos.

Caso uma dessas condições falhe, o texto deve relatar que a campanha não
estabeleceu a vantagem, apresentando os resultados descritivos e a limitação.
