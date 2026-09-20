# Relatório consolidado dos experimentos do G-FShield

**Data de corte:** 19 de setembro de 2026, 22:45 BRT (20 de setembro de 2026, 01:45 UTC).

## 1. Conclusão executiva

Os experimentos não sustentam a afirmação ampla de que o G-FShield é sempre
mais rápido, mais econômico ou melhor que um monólito. Eles sustentam uma
conclusão arquitetural mais precisa e defensável:

> Sob o mesmo algoritmo, dados, classificador, prazo e teto agregado de
> recursos, o pipeline distribuído efetivamente sobrepõe construção e busca
> local, aumenta a vazão bruta de avaliações e, na campanha confirmatória v10,
> produziu mais subconjuntos distintos de alta qualidade dentro do prazo, sem
> ultrapassar a margem pré-especificada de perda de qualidade no teste.

Essa vantagem é específica ao **rendimento de soluções qualificadas em uma
única busca**. O monólito foi melhor em outros objetivos: menor latência até a
primeira solução com F1 0,94, melhor trajetória *anytime*, menor custo de CPU e
memória por candidato e maior capacidade para várias solicitações independentes
simultâneas na configuração atual.

Até esta data há:

- 456 execuções válidas concluídas nas quatro campanhas formais centrais;
- 200 células válidas nos estudos exploratórios de carga concorrente;
- 124 reavaliações controladas com XGBoost no estudo externo;
- pilotos funcionais, ablações de implementação e testes de resiliência;
- 44 das 100 células formais da ablação de pipeline v11 concluídas, sem
  tentativa inválida, com a 45ª célula em execução no momento da consulta.

## 2. Mapa dos estudos e nível de evidência

| Estudo | Estado | Escala | Natureza da evidência | Resultado resumido |
|---|---|---:|---|---|
| Pilotos formais e resiliência | concluído | diagnóstico | validação de infraestrutura | contratos, checkpoint, encerramento, retomada e rotação de logs aprovados |
| Campanha ampla de 10 dias | concluído | 216 execuções válidas | exploratória, seleção de configuração | RF--VND--IWSSR teve a maior mediana de F1 de teste, mas nenhuma das 72 comparações exploratórias foi significativa após Holm |
| Campanha causal v9 | concluído | 60 execuções, 30 pares | formal, hipótese de latência | confirmou sobreposição e vazão; rejeitou vantagem de latência e não demonstrou eficiência de recursos |
| Ablação do filtro em lote | concluído | 2 células | diagnóstico de implementação | a correção aumentou fortemente as contagens de avaliações e liberou a campanha externa; não é comparação arquitetural |
| X-CANIDS/IWSHAP | concluído | 120 execuções formais + 124 reavaliações XGBoost | validade externa, parte inferencial e parte descritiva | aproximadamente 2,3 vezes mais avaliações IWSSR/s, mas pior AUC *anytime* e maior consumo; resultado externo misto |
| Rendimento de qualidade v10 | concluído | 60 execuções, 30 pares | confirmatória independente | vantagem delimitada e estatisticamente sustentada em subconjuntos distintos com F1 de validação >= 0,945 |
| Carga concorrente original | concluído antecipadamente | 100 células, 5 sementes | exploratória | empate em baixa carga; gargalo grave do distribuído em cargas 8 e 16 |
| Otimização de carga concorrente | concluído | 100 células | exploratória e pós-hoc | rebalanceamento e réplicas RCL recuperaram algum trabalho, mas permaneceram muito abaixo do monólito |
| Ablação de pipeline v11 | em execução | 44/100 células formais | confirmatória, resultado ainda indisponível | medirá efeito de 1, 2 e 4 workers sob teto fixo; análise parcial é proibida pelo protocolo |

## 3. Ambiente e controles comuns

As campanhas foram executadas no servidor `mc2-server-01`, com dois Intel Xeon
E5-2620 v4, 32 CPUs lógicas e aproximadamente 64 GiB de RAM. Os estudos mais
recentes isolaram as CPUs 8--15 no nó NUMA 1 e registraram imagens, commits,
parâmetros, hashes de dados, manifestos de saída e amostras de recursos.

Nos experimentos pareados mais importantes, as duas arquiteturas receberam:

- o mesmo conjunto de treino, validação e teste;
- seleção somente por validação e uma consulta final ao teste;
- a mesma semente e a mesma sequência ReliefF--VND--IWSSR;
- Weka J48 3.8.6, salvo na reavaliação externa explicitamente feita com XGBoost;
- RCL 30, subconjunto inicial 5, amostra ReliefF 1.000, 100 ciclos VND, 100
  iterações IWSSR e melhora mínima 0,0001;
- prazo e teto agregado de CPU/RAM iguais por braço;
- ordens AB/BA ou Williams para reduzir efeito de posição temporal;
- unidade experimental definida pela semente, sem tratar candidatos internos
  ou jobs do mesmo lote como replicações independentes.

## 4. Pilotos formais e ensaio de resiliência

Antes da campanha de 10 dias, os pilotos verificaram contratos de resultado,
hashes, limites de contêiner, classificação final e persistência de estado. O
relatório de resiliência foi aprovado sem problemas registrados e confirmou:

- persistência atômica e retomada de checkpoint sem perder a execução concluída
  nem alterar o prazo global;
- encerramento gracioso por SIGTERM e encerramento forçado por SIGKILL;
- limpeza de processo órfão;
- reinício do orquestrador em teste automatizado;
- rotação de log com arquivo e checksum;
- projeção de armazenamento suficiente para 240 horas.

**Ponto positivo:** demonstrou que o supervisor experimental era retomável e
que os artefatos poderiam ser preservados após interrupções.

**Ponto negativo:** foi um ensaio de controle do supervisor, não uma campanha de
injeção de falhas no sistema distribuído. Ele não mede perda/duplicação de
eventos, recuperação do Kafka, reprocessamento idempotente, tempo de recuperação
ou manutenção de qualidade durante falhas. Portanto, não prova tolerância a
falhas do G-FShield em produção.

## 5. Campanha ampla de configurações — 10 dias

### Objetivo e desenho

A campanha `gfshield-10d-2026-v1` comparou 24 combinações distribuídas, dois
monólitos e o baseline com todas as 51 características. Foram usadas oito
sementes, totalizando 216 execuções válidas. Houve 12 tentativas inválidas,
excluídas pelo contrato de artefatos e repetidas com sucesso. O teto por braço
foi 8 CPUs e 16 GiB; a seleção teve aproximadamente 2.700 s dentro de 3.000 s.

### Resultado principal

| Configuração | F1 macro mediano no teste | Atributos | Redução dimensional |
|---|---:|---:|---:|
| RF--VND--IWSSR | 0,944750 | 11 | 78,43% |
| Monólito 1 — GR--BitFlip | 0,939682 | 5 | 90,20% |
| Todas as 51 características | 0,937809 | 51 | 0% |
| Monólito 2 — GR--IWSS | 0,8411 | 5 | 90,20% |

RF--VND--IWSSR superou descritivamente o baseline de 51 atributos em 0,00694
de F1 macro e reteve apenas 11 atributos. Entretanto, nenhuma das 72
comparações pareadas exploratórias permaneceu significativa após a correção de
Holm.

### Pontos positivos

- identificou RF--VND--IWSSR como a configuração mais promissora para os
  experimentos causais posteriores;
- mostrou bom compromisso entre qualidade e redução dimensional;
- incluiu baseline de todas as características e os dois monólitos;
- separou as 216 execuções válidas das 12 tentativas inválidas.

### Pontos negativos e limitações

- apenas oito sementes por braço e muitas comparações;
- seleção da melhor configuração e avaliação no mesmo conjunto de braços,
  exigindo confirmação independente;
- algoritmos diferentes entre vários braços, portanto a campanha não isolava o
  efeito da arquitetura;
- os CSVs monolíticos registravam duração por candidato, não uma linha temporal
  cumulativa equivalente; assim, essa campanha não permite uma comparação
  arquitetural válida de tempo até o limiar;
- o resultado é descritivo/exploratório, não prova superioridade estatística.

## 6. Campanha causal de arquitetura v9

### Objetivo e desenho

A campanha `gfshield-architecture-causal-2026-v9` isolou arquitetura mantendo
RF--VND--IWSSR, dados, J48, parâmetros, prazo e teto de 6 CPUs/12 GiB. Foram 30
sementes pareadas, 42--71, e 60 execuções válidas. Sete primeiras tentativas
distribuídas falharam na inicialização Kafka/ZooKeeper e foram repetidas; apenas
os artefatos válidos entraram na inferência.

O desfecho primário era o tempo até F1 macro de validação 0,94. A salvaguarda de
qualidade exigia limite inferior unilateral de 95% de pelo menos -0,005 para a
diferença de F1 de teste entre distribuído e monólito.

### Resultados

| Medida | G-FShield | Monólito | Interpretação |
|---|---:|---:|---|
| F1 macro mediano no teste | 0,945529 | 0,944699 | valores próximos |
| Vazão mediana | 0,1074 candidato/s | 0,0739 candidato/s | cerca de 45,3% maior no distribuído |
| Sobreposição construção--busca | 99,998% | 0% | mecanismo do pipeline confirmado |
| Tempo até F1 0,94 | +422,740 s de diferença pareada | referência | distribuído mais lento; 7 vitórias e 23 derrotas |
| CPU mediana utilizada | 4,076 núcleos | 1,004 núcleo | maior paralelismo e maior custo |
| CPU-h/candidato | 0,010875 | 0,003821 | monólito mais econômico |
| GiB-h/candidato | 0,012366 | 0,004904 | monólito mais econômico |
| Redução dimensional mediana | 78,43% | 76,47% | +1,96 ponto percentual no distribuído |

O teste primário deu `p=0,000795`, mas na direção contrária à hipótese de menor
latência. A vazão e a sobreposição favoreceram o distribuído em todos os 30
pares (`p_Holm=0,000055`). A diferença média de F1 no teste foi -0,001759 e o
limite inferior unilateral foi -0,005615, ligeiramente abaixo da margem -0,005;
logo, a salvaguarda de não inferioridade falhou.

### Pontos positivos

- isolou o efeito arquitetural com paridade algorítmica;
- comprovou a execução concorrente das fases e o aumento de vazão;
- mostrou redução dimensional ligeiramente maior;
- gerou a hipótese específica de rendimento de soluções de alta qualidade,
  posteriormente testada com sementes independentes na v10.

### Pontos negativos

- não demonstrou menor latência para a primeira boa solução;
- a trajetória *anytime* favoreceu o monólito;
- consumiu mais CPU e memória por candidato;
- falhou por pequena margem na salvaguarda de qualidade;
- sete falhas iniciais expuseram fragilidade de inicialização, embora as
  repetições válidas tenham sido controladas e auditadas.

## 7. Ablação de implementação antes do estudo X-CANIDS

Uma ablação distribuída de duas células, uma por cenário X-CANIDS, avaliou a
alteração do filtro em lote. O gate registrou aumento de contagens de construção
de aproximadamente 202 vezes em fabricação e 214 vezes em suspensão, e aumento
de avaliações de busca local de aproximadamente 86 vezes nos dois cenários em
relação à referência anterior. O gate `PASS` permitiu iniciar a campanha formal.

**Ponto positivo:** detectou e removeu um gargalo real de implementação antes de
gastar as 120 execuções formais.

**Ponto negativo:** usou uma semente, somente a arquitetura distribuída e uma
referência anterior. É validação de uma correção de engenharia, não evidência de
superioridade sobre o monólito nem estimativa generalizável de aceleração.

## 8. Comparação externa X-CANIDS/IWSHAP

### Dados e protocolo

O código IWSHAP foi fixado no commit
`fb0d3093c12421d08ab3fb595d20c29ba2442e65`. Foram usados dois cenários com
20.000 registros e 688 preditores. O particionamento 60/20/20 agrupou vetores
completos idênticos para impedir sua presença em mais de uma partição:

- suspensão: 12.081/3.892/4.027 registros e 14.743 vetores únicos;
- fabricação: 11.944/3.994/4.062 registros e 13.553 vetores únicos.

A comparação arquitetural teve 30 sementes por cenário e arquitetura, ou 120
execuções válidas, com 1.080 s de seleção em 1.200 s, máximo de 50 melhorias,
três consumidores e teto comum de 6 CPUs/12 GiB.

### Arquitetura distribuída versus monólito pareado, com J48

| Cenário e medida | G-FShield | Monólito | Leitura correta |
|---|---:|---:|---|
| Suspensão — F1 macro teste | 0,790717 | 0,787396 | diferença pequena; `p_Holm=0,438598` |
| Fabricação — F1 macro teste | 0,902245 | 0,900280 | diferença mediana zero; `p_Holm=1` |
| Suspensão — AUC *anytime* | 0,724464 | 0,733062 | favorece monólito |
| Fabricação — AUC *anytime* | 0,831286 | 0,839406 | favorece monólito |
| Suspensão — IWSSR/s | 8,580 | 3,698 | cerca de 2,32 vezes maior |
| Fabricação — IWSSR/s | 8,302 | 3,678 | cerca de 2,26 vezes maior |
| Sobreposição | >99,65% | 0% | pipeline concorrente confirmado |
| CPU-segundos, suspensão | 3.853,1 | 1.100,7 | maior custo no distribuído |
| Pico RAM, suspensão | 3.370,3 MiB | 770,1 MiB | maior custo no distribuído |
| CPU-segundos, fabricação | 3.858,4 | 1.096,9 | maior custo no distribuído |
| Pico RAM, fabricação | 3.169,8 MiB | 774,6 MiB | maior custo no distribuído |

O monólito também atingiu mais cedo o limiar descritivo derivado do baseline:
92,071 s contra 114,463 s em suspensão e 90,091 s contra 101,047 s em
fabricação. Como esse desfecho não estava no manifesto congelado, ele deve
permanecer descritivo.

### Reprodução do artefato IWSHAP

A reprodução usou pandas 2.2.2, NumPy 1.26.4, SHAP 0.45.1, XGBoost 2.0.3 e
scikit-learn 1.5.0.

- suspensão: F1 positivo 0,635693 com dois atributos, diferente do log histórico
  de junho, que informa 0,918619 e 16 atributos;
- fabricação: F1 positivo 0,787387 com quatro atributos, reproduzindo o
  subconjunto do log de julho.

O protocolo original codifica categorias antes da divisão e reutiliza a mesma
partição de 20% durante seleção e avaliação. Por isso, a reprodução verifica o
artefato, mas seus números não são um teste intocado equivalente ao protocolo
principal.

### Reavaliação por classificador comum, XGBoost

Foram feitas 124 avaliações: 120 subconjuntos congelados e quatro comparadores
(todas as características e subconjunto histórico em cada cenário).

| Cenário/método | Atributos medianos | F1 macro teste | F1 positivo teste |
|---|---:|---:|---:|
| Suspensão — IWSHAP histórico | 16 | 0,830048 | 0,699894 |
| Suspensão — G-FShield | 20,5 | 0,723518 | 0,511074 |
| Suspensão — monólito | 21 | 0,723544 | 0,510315 |
| Fabricação — IWSHAP histórico | 4 | 0,882423 | 0,799667 |
| Fabricação — G-FShield | 17 | 0,887680 | 0,803178 |
| Fabricação — monólito | 17 | 0,889053 | 0,805639 |

Em suspensão, nenhuma das 30 execuções G-FShield superou o subconjunto IWSHAP
histórico em F1 macro ou F1 positivo. Em fabricação, 26/30 superaram o IWSHAP
em F1 macro e 16/30 em F1 positivo. O maior F1 macro G-FShield foi 0,900958,
com 19 atributos e F1 positivo 0,826347. Entretanto, o IWSHAP teve revocação
positiva 0,979633, contra mediana 0,820774 do G-FShield; o G-FShield teve maior
precisão mediana, 0,787196 contra 0,675562.

### Pontos positivos

- confirmou a sobreposição e a maior vazão de IWSSR em outro conjunto de dados;
- preservou paridade algorítmica na comparação arquitetural;
- usou partição resistente a vazamento e reavaliação por classificador comum;
- encontrou vantagem descritiva de qualidade no cenário de fabricação.

### Pontos negativos

- o monólito manteve melhor AUC *anytime* e menor consumo;
- não houve superioridade estatística de F1 entre as arquiteturas;
- o G-FShield perdeu claramente para o subconjunto IWSHAP em suspensão;
- a vantagem de fabricação usa mais atributos e troca revocação por precisão;
- o log histórico de suspensão não contém hash nem quantidade de linhas e não
  pode ser reproduzido com segurança a partir do CSV demonstrativo fornecido;
- comparações contra um único subconjunto histórico são descritivas, não um
  teste pareado de superioridade.

## 9. Campanha confirmatória de rendimento de qualidade v10

### Hipótese e desenho

A v10 usou 30 sementes novas, 72--101, sem sobreposição com a v9. Foram 60
execuções válidas, sem repetição, com RF--VND--IWSSR, 2.700 s, 6 CPUs e 12 GiB.
O desfecho primário pré-especificado foi a quantidade de subconjuntos distintos
com F1 macro de validação >= 0,945 produzidos até o prazo.

### Resultado

| Medida | Resultado |
|---|---:|
| Mediana G-FShield | 1 subconjunto qualificado |
| Mediana monólito | 0 subconjuntos qualificados |
| Diferença média pareada | +0,933 subconjunto/execução |
| IC bootstrap 95% da média | 0,233 a 1,667 |
| Vitórias / empates / derrotas | 13 / 12 / 5 |
| Permutação pareada unilateral | `p=0,010135` |
| Limite inferior de qualidade | -0,003791, acima da margem -0,005 |
| Sobreposição mediana | 99,37% contra 0% |

### Pontos positivos

- confirmação com sementes independentes de uma hipótese gerada pela v9;
- efeito positivo com intervalo de confiança acima de zero e teste
  pré-especificado significativo;
- salvaguarda de qualidade no teste satisfeita;
- paridade de algoritmo, recursos e prazo;
- mecanismo arquitetural confirmado pela telemetria de sobreposição.

### Pontos negativos e limite da conclusão

- a diferença mediana pareada foi zero porque houve 12 empates;
- o efeito depende do limiar 0,945 e do horizonte de 2.700 s;
- cinco sementes favoreceram o monólito;
- o estudo não demonstra menor latência nem eficiência de recursos;
- usa um host, um corpus principal e J48, limitando generalização.

Este é o resultado mais forte a favor do G-FShield, mas a formulação correta é
“vantagem arquitetural delimitada em rendimento de soluções de alta qualidade”,
e não “superioridade global”.

## 10. Experimentos de carga concorrente

### Campanha original

O desenho original previa 600 células: 30 sementes, dois cenários, cinco níveis
de concorrência (1, 2, 4, 8 e 16) e duas arquiteturas. Por solicitação do usuário,
a execução foi encerrada no primeiro bloco balanceado de 100 células, com cinco
sementes. O estudo é, portanto, exploratório.

Com orçamento agregado de 6 CPUs/12 GiB por arquitetura, o G-FShield empatou o
monólito nas cargas 1 e 2 e ficou próximo na carga 4. Nas cargas 8 e 16, o perfil
distribuído original teve mediana zero de jobs qualificados, contra 8 e 16 no
monólito. O piloto de carga 16 já havia identificado o serviço de construção com
uma CPU como gargalo de rajada.

### Perfis otimizados

Foram executadas mais 100 células distribuídas: 50 `rebalanced` e 50
`scaled-rcl`, comparadas às células monolíticas congeladas.

- `rebalanced`: aumentou CPU/RAM do RCL e reduziu a alocação do IWSSR;
- `scaled-rcl`: além do rebalanceamento, usou até quatro réplicas RCL com
  roteamento round-robin;
- ambos incluíram cache de ARFF com *single flight*, cache de validação e remoção
  de cópias redundantes de `Instances`.

O perfil `rebalanced` produziu medianas de 3 contra 4 jobs qualificados na carga
4, 2 contra 8 na carga 8 e 3 contra 16 na carga 16. O `scaled-rcl` também não
atingiu paridade: em fabricação produziu 1/2/2/3/3 contra 1/2/4/8/16; em
suspensão, 1/1/2/2/3 contra 1/2/4/8/16.

### Pontos positivos

- o experimento revelou um gargalo de capacidade que não aparece em uma única
  solicitação;
- as otimizações recuperaram resultados não nulos nas cargas 8 e 16;
- 200 células terminaram válidas, sem erro de infraestrutura nas 100 células
  otimizadas;
- persistiram roteamento, réplica, porta, ordem, recursos e checksums;
- demonstrou que componentes independentes podem ser rebalanceados e replicados
  sem reescrever todo o sistema.

### Pontos negativos

- o monólito foi claramente melhor em jobs qualificados por lote sob alta carga;
- os perfis distribuídos demoraram mais para atingir o limiar;
- menor CPU/RAM em algumas células de alta carga coincidiu com muito menos
  trabalho útil e não pode ser chamada de maior eficiência;
- cinco sementes e otimizações pós-hoc impedem conclusão confirmatória;
- o experimento mostra que a capacidade de escalar componentes existe como
  propriedade de projeto, mas a configuração atual ainda não escala bem para
  muitas buscas independentes concorrentes.

## 11. Ablação confirmatória do pipeline v11 — estado atual

A v11 foi congelada antes das sementes 102--126 e contém 100 células: monólito,
distribuído com 1 worker, 2 workers e 4 workers. Um desenho Williams equilibra a
posição dos quatro tratamentos. Todos mantêm RF--VND--IWSSR, J48, os mesmos
dados, 2.700 s de seleção e teto de 6 CPUs/12 GiB.

O desfecho primário é a inclinação pareada da AUC normalizada de rendimento de
subconjuntos com F1 de validação >= 0,945 em função de `log2(workers)`. Também são
obrigatórias três salvaguardas:

1. AUC média não decrescente de 1 para 2 e 4 workers;
2. limite inferior unilateral de F1 de teste, w4 menos monólito, >= -0,005;
3. sobreposição positiva nos braços distribuídos e zero no monólito.

O piloto teve 4/4 células válidas na primeira tentativa e foi excluído da
inferência. Uma primeira versão do gate rejeitou corretamente o lançamento por
consultar o nome de variável errado; a versão corrigida auditou as chaves
materializadas pelo Docker Compose e só então liberou a campanha formal.

### Fotografia de 19/09/2026, 22:45 BRT

- estado: `RUNNING`;
- início: 18/09/2026, 14:03:53 UTC;
- prazo rígido: 28/09/2026, 14:03:53 UTC;
- 44/100 células concluídas e validadas;
- 44 tentativas registradas, sem repetição ou tentativa inválida;
- 11 células concluídas de cada braço;
- células completas até a semente 112;
- em execução: semente 113, braço `distributed-w4`;
- progresso: 44%; mantendo-se o ritmo observado, a conclusão operacional seria
  esperada por volta de 21/09 UTC, mas isso é somente projeção, não compromisso.

Nenhum resultado parcial de qualidade ou desempenho deve ser usado. O teste
estatístico só é válido após `CAMPAIGN_COMPLETED`, 100 células e auditoria de
todos os manifestos.

### O que a v11 poderá responder

- diferença entre pipeline de um worker e monólito, isolando a sobreposição;
- resposta à dose de 1, 2 e 4 workers sob o mesmo teto agregado;
- se mais concorrência interna realmente aumenta AUC de rendimento de soluções;
- custo em CPU-h e GiB-h por subconjunto qualificado;
- comportamento de backlog/lag do Kafka.

Ela não medirá escalabilidade entre vários hosts, tolerância a falhas ou carga de
muitas solicitações independentes.

## 12. Síntese dos pontos positivos

1. **Mecanismo arquitetural demonstrado.** A construção continua enquanto
   buscas locais processam candidatos anteriores; a sobreposição ficou próxima
   de 100% nos estudos formais e zero no monólito.
2. **Maior vazão interna.** Na v9, a vazão de candidatos foi cerca de 45% maior;
   no X-CANIDS, a vazão de IWSSR foi aproximadamente 2,3 vezes maior.
3. **Vantagem confirmatória de rendimento de qualidade.** A v10 encontrou
   +0,933 subconjunto distinto qualificado por execução, IC95% 0,233--1,667 e
   `p=0,010135`, com salvaguarda de qualidade satisfeita.
4. **Boa seleção de atributos.** A melhor configuração ampla obteve F1 0,944750
   com 11 de 51 características; a v9 também mostrou redução dimensional um
   pouco maior no distribuído.
5. **Validade externa parcial.** O mecanismo de vazão reapareceu no X-CANIDS e
   houve vantagem descritiva contra IWSHAP no cenário de fabricação.
6. **Rastreabilidade forte.** Commits, tags, imagens, hashes, estado retomável,
   manifestos e análise versionada reduzem o risco de resultados irreproduzíveis.
7. **Evolução orientada por evidência.** Resultados negativos levaram a hipóteses
   novas e independentes, em vez de serem omitidos: v9 gerou v10; carga alta
   motivou rebalanceamento; v10 e carga motivaram v11.

## 13. Síntese dos pontos negativos

1. **Latência da primeira solução.** O monólito foi mais rápido até F1 0,94 na
   v9 e melhor na AUC *anytime* em ambos os cenários X-CANIDS.
2. **Custo de recursos.** O distribuído usou mais CPU e RAM por candidato nos
   estudos pareados de uma solicitação.
3. **Carga concorrente.** A configuração atual não acompanha contêineres
   monolíticos isolados em cargas 8 e 16; as otimizações apenas reduziram a
   diferença.
4. **Qualidade não universalmente superior.** A campanha ampla não teve
   comparações significativas após Holm; no X-CANIDS, diferenças J48 de F1 foram
   pequenas e não significativas.
5. **Comparação externa mista.** O G-FShield foi competitivo em fabricação, mas
   inferior ao subconjunto histórico no cenário de suspensão.
6. **Generalização limitada.** A maior parte da evidência usa um host, um
   classificador e poucos corpora.
7. **Resiliência e escalabilidade projetadas, não comprovadas.** Os testes atuais
   não demonstram recuperação de broker, ausência de perda de eventos, scale-out
   entre hosts nem disponibilidade operacional.
8. **Resultado v11 pendente.** Ainda não se sabe se o rendimento cresce de forma
   monotônica com 1, 2 e 4 workers sob o mesmo orçamento.

## 14. Afirmações permitidas e afirmações que devem ser evitadas

### Formulação sustentada

> Nos experimentos controlados, a decomposição do G-FShield confirmou a
> sobreposição entre construção e busca local e elevou a vazão interna. Em uma
> campanha confirmatória independente de 30 sementes, essa concorrência se
> traduziu em maior rendimento médio de subconjuntos distintos com F1 de
> validação de pelo menos 0,945 dentro de 2.700 s, mantendo a perda de qualidade
> no teste dentro da margem pré-especificada. A vantagem é delimitada a esse
> objetivo; o monólito apresentou menor latência para a primeira solução e menor
> custo de recursos, e foi superior sob alta carga de solicitações independentes
> na configuração avaliada.

### Afirmações não sustentadas

- “O G-FShield é sempre mais rápido que os monólitos.”
- “O G-FShield usa menos recursos” ou “é mais eficiente por CPU/RAM”.
- “A arquitetura escala horizontalmente” como resultado medido.
- “O sistema é tolerante a falhas” como conclusão experimental.
- “O G-FShield supera o IWSHAP em geral.”
- “A campanha ampla provou significância estatística da melhor configuração.”
- “Maior número de avaliações implica automaticamente melhor F1 final.”

## 15. Experimentos e ações ainda necessários

1. Concluir e auditar a v11, executar a análise congelada e integrar o resultado
   em português e inglês, inclusive se nulo ou desfavorável.
2. Não promover o estudo de carga de cinco sementes a confirmatório. Antes de
   gastar 30 sementes, redesenhar o gargalo de admissão/construção e exigir em
   piloto paridade razoável nas cargas 8 e 16.
3. Executar injeção de falhas em Kafka, consumidores e persistência, medindo
   perda/duplicação, tempo de recuperação, reprocessamento e reconstrução por
   `run_id`.
4. Repetir em outro host ou em dois nós, com limites de CPU/RAM variados, para
   separar escalabilidade real de concorrência dentro de uma única máquina.
5. Repetir com pelo menos outro classificador e outro corpus CPS/ICS.
6. Obter o arquivo exato associado ao log histórico de suspensão do IWSHAP ou
   manter explicitamente a incerteza de versão/volume.
7. Medir energia apenas com sensor real; não inferi-la a partir de CPU%.
8. Depositar código, manifestos, dados redistribuíveis e artefatos em repositório
   persistente com tag e, idealmente, DOI.

## 16. Proveniência essencial

| Estudo | Identificador principal |
|---|---|
| Campanha 10 dias | imagem/código `b38eff3`; manifesto SHA-256 `29fdc973...`; estado `e28790b2...` |
| Arquitetura v9 | commit `7960791`; tag `experiment-architecture-causal-v9`; estado `7c98cef2...` |
| Qualidade v10 | commit/tag `5dec3b1...` / `experiment-architecture-quality-yield-v10`; análise `ba35c26ac` |
| IWSHAP | fonte externa `fb0d3093...`; estado `22213d22...`; manifesto de dados `d7bd8b3d...` |
| Carga otimizada | análise `45735d343add`; estado baseline `2e2c8e8d...`; manifesto otimizado `b0c5ca58...` |
| Pipeline v11 | commit `75b2db2e...`; tag `experiment-pipeline-ablation-v11`; protocolo `3ba098d0...` |

Artefatos locais principais:

- `docs/dissertation-review/experiment-10d-analysis/`;
- `docs/dissertation-review/architecture-causal-analysis/`;
- `docs/dissertation-review/architecture-quality-yield-analysis/`;
- `docs/dissertation-review/iwshap-comparison-analysis/`;
- `docs/dissertation-review/iwshap-comparison-final-report.md`;
- branch experimental `experiment/iwshap-comparison`, que contém protocolos,
  runners, analisadores e registros dos estudos de carga e da v11.

