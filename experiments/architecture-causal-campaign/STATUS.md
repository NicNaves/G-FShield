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
da conclusão e análise da campanha v6.

## Desenho formal congelado para a v6

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
- a revisão seguinte troca `jakarta.annotation.PreDestroy`, incompatível com
  Spring Boot 2.7.5, por `DisposableBean` e congela a identidade/tag v6.

Servidor autorizado pelo usuário:

- repositório principal: `/home/idscps/nicolas/G-FShield` (sujo; não alterar);
- campanha anterior: `/home/idscps/nicolas/G-FShield-experiment-10d`;
- worktree isolado: `/home/idscps/nicolas/G-FShield-architecture-causal`;
- artefatos: `/home/idscps/nicolas/experiment-artifacts/architecture-causal`;
- piloto v2: `/home/idscps/nicolas/experiment-artifacts/architecture-causal/pilot-v2`.

As credenciais do servidor não devem ser registradas no repositório.

## Estado de versionamento

`b3bc392` contém a persistência imediata das métricas de construção. A
primeira compilação da v5 no servidor falhou antes do piloto porque o módulo
IWSSR usa Spring Boot 2.7.5 e não fornece `jakarta.annotation.PreDestroy`. A v6
substitui essa anotação pela interface Spring `DisposableBean`, preservando o
fechamento seguro do escritor e a gravação sincronizada por registro.

Os bundles locais `architecture-causal-*.bundle` são artefatos temporários e
não devem ser adicionados ao Git.

## Próximos passos obrigatórios

1. Executar os 49 testes locais novamente.
2. Criar o commit e a tag `experiment-architecture-causal-v6`.
3. Gerar e enviar um novo bundle ao servidor.
4. Fazer fast-forward do worktree isolado; não tocar no repositório principal
   sujo nem nos contêineres de produção.
5. Validar `docker compose config`, conferindo três partições/consumidores e a
   soma de 6 CPUs/12 GiB.
6. Recompilar as seis imagens com um sufixo derivado do commit v6.
7. Executar novo piloto pareado em diretório `pilot-v6` separado.
8. Confirmar no piloto:
   - três buscas IWSSR simultâneas com seeds/candidatos distintos;
   - ausência de corrupção no CSV;
   - igualdade do primeiro subconjunto e F1 entre os braços, ajustando índices
     Java de base 1 para Python de base 0;
   - presença de `campaignElapsedMs`, intervalos de fase, resultados finais,
     amostras de recursos e checksums;
   - nenhuma exceção, OOM, reinício ou timeout de polling Kafka.
9. Somente depois iniciar a campanha formal v6 em `tmux`, com estado/resultados
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
