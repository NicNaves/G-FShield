# Relatório consolidado dos experimentos do G-FShield

Data de corte: 27/09/2026. Consulta dos estados e resultados no servidor nesta data.

## 1. Conclusão executiva

O G-FShield tem contribuições experimentais defensáveis, mas os resultados não sustentam superioridade geral sobre monólitos ou sobre o IWShap.

Os pontos mais fortes são a sobreposição efetiva entre construção e busca local, a maior vazão interna de avaliações e o aumento confirmado do rendimento de subconjuntos qualificados na campanha v10. Na v13, uma otimização específica — limitar a três os treinamentos simultâneos do IWSSR — melhorou a disponibilidade acumulada de soluções qualificadas publicadas.

Os principais custos são maior consumo de CPU/RAM, ausência de vantagem consistente no tempo até a primeira boa solução e desempenho inferior sob alta carga de solicitações independentes. A comparação externa é mista: vantagem descritiva de F1 em fabricação, mas perda importante em suspensão. Em fabricação, o ganho de F1 vem acompanhado de mais atributos e menor revocação de ataques.

A formulação central defensável é: **a arquitetura possibilita exploração concorrente e pode aumentar o rendimento de soluções de qualidade sob um prazo fixo, com custos e benefícios dependentes da configuração e da carga**. Isso não equivale a comprovar menor custo, melhor detecção em tempo real ou escalabilidade entre máquinas.

## 2. Escopo e unidades de comparação

Este documento consolida as campanhas científicas e os principais pilotos identificados nos relatórios locais e nos artefatos do servidor. Não é um inventário de cada teste unitário ou tentativa de depuração.

- Seis campanhas centrais concluídas somam 656 execuções válidas: inicial 216, v9 60, v10 60, X-CANIDS 120, v11 100 e v13 100.
- Os estudos exploratórios de carga acrescentam 200 células: 100 originais e 100 distribuídas otimizadas. Uma célula pode conter vários jobs; não equivale a uma execução de busca individual.
- Há 124 reavaliações XGBoost de subconjuntos congelados: não são 124 novas buscas.
- Pilotos recentes: v12 com nove células e v14-r2 com quatro. Existem também pilotos anteriores e uma ablação de filtro em lote.
- As 99 execuções formais planejadas da v12 e as 80 da v14 não são contabilizadas como executadas.

F1 está na escala 0–1. Macro-F1 atribui peso igual às classes; F1 positivo mede especificamente a classe de ataque na comparação binária. Não se subtraem essas métricas entre si. Diferença entre medianas não é necessariamente a mediana das diferenças pareadas.

Uma linha de candidato não é uma réplica experimental independente. As inferências usam sementes/execuções pareadas ou sementes de lote, conforme o protocolo. Sementes novas não representam novos datasets, novos hosts ou novos particionamentos.

## 3. Quadro geral dos testes

| Estudo | Escala concluída | Resultado favorável | Resultado desfavorável / limite |
| --- | ---: | --- | --- |
| Campanha inicial, até dez dias | 216 válidas; 228 tentativas | Boa qualidade com redução de atributos | Nenhuma das 72 comparações exploratórias significativa após Holm; algoritmos diferentes confundem arquitetura |
| Arquitetura v9 | 60; 30 pares | Mais vazão e sobreposição próxima de 100% | Mais lento até F1 0,94; maior custo; salvaguarda de qualidade não satisfeita |
| Rendimento v10 | 60; 30 pares novos frente à v9 | +0,933 subconjunto qualificado por execução; p=0,010135 | Ganho específico frente a monólito sequencial, no mesmo split |
| X-CANIDS, arquitetura | 120; 30 pares por cenário | Aproximadamente 2,3× mais avaliações IWSSR/s | Monólito com melhor trajetória de qualidade ao longo do tempo e menor consumo |
| XGBoost comum / IWShap | 124 reavaliações | G-FShield ligeiramente melhor em fabricação, descritivamente | Pior em suspensão; mais atributos e menor revocação em fabricação |
| Carga concorrente original | 100 células; cinco sementes de lote | Identificou gargalo sob cargas altas | Cargas 8 e 16 favoreceram fortemente o monólito |
| Carga rebalanceada / RCL replicada | 100 novas células distribuídas | Recuperação parcial de jobs qualificados | Não superou o monólito; comparadores monolíticos reutilizados, não novas réplicas |
| Pipeline v11 | 100; 25 sementes × quatro braços | Vazão maior com concorrência | Escalonamento do rendimento não confirmado: p=0,216439 |
| Piloto v12 | Nove células; uma semente | Instrumentação distingue treinos e reuso | Distribuídos com F1 inferior; não permite inferência |
| Otimizações v13 | 100; 20 sementes × cinco braços | Limite de treinamento três melhorou AUC publicada: p ajustado=0,011719 | Superioridade da AUC frente ao monólito não confirmada; mais recursos |
| Piloto v14-r2 | Quatro células; uma semente | Comparador monolítico paralelo implementado e piloto concluído | Monólito paralelo avaliou mais candidatos neste piloto; formal ainda não começou |

## 4. Comparação principal: G-FShield versus IWShap

### 4.1. O que foi comparado

Fonte externa: [repositório IWShap](https://github.com/sf24-iwshap/sf24-iwshap), fixado no commit `fb0d3093c12421d08ab3fb595d20c29ba2442e65`.

O CSV reduzido de julho e o log de junho indicados originalmente não são o mesmo experimento:

- Julho: fabricação, quatro atributos, CSV com 20.000 linhas e sem rótulos.
- Junho: suspensão, 16 atributos, F1 positivo histórico 0,918619; o log não identifica hash nem quantidade de registros.
- O log correspondente a julho informa F1 positivo 0,787387.
- Os demonstrativos usados na replicação têm 20.000 registros e 688 preditores por cenário. Não reproduzem a escala de 784.744 instâncias do experimento de suspensão descrito no trabalho.

Há três camadas de evidência que devem permanecer separadas:

1. Resultado histórico publicado pelos autores.
2. Reprodução do código original no demonstrativo público.
3. Reavaliação de subconjuntos congelados com dados, partições e classificador comuns.

O IWShap combina seleção incremental com ordenação SHAP. Sua explicabilidade por SHAP é uma característica relevante que nossos ganhos de vazão não substituem. A descrição e as dependências estão no [README oficial](https://github.com/sf24-iwshap/sf24-iwshap/blob/main/README.md).

### 4.2. Reprodução do código original

| Cenário | F1 positivo reproduzido | Atributos | Tempo observado da execução |
| --- | ---: | ---: | ---: |
| Suspensão | 0,635693 | 2 | 52,6 s |
| Fabricação | 0,787387 | 4 | 82,7 s |

Fabricação reproduziu o F1 e o subconjunto de julho. Suspensão não reproduziu o resultado histórico de junho; isso não demonstra erro do trabalho, pois a correspondência exata de dados/escala não está estabelecida.

O código original usa divisão 80/20, semente 42, codificação categórica anterior à divisão e reutiliza os mesmos 20% para orientar a seleção e reportar qualidade. Por isso, esses F1 não equivalem a uma avaliação final independente. Os tempos acima também não estabelecem vantagem de velocidade sobre nossa busca de duração fixa: protocolos e objetivos diferem.

### 4.3. Avaliação comum com XGBoost: resultado mais relevante contra o trabalho

Foram reavaliados 120 subconjuntos de G-FShield/monólito e quatro comparadores fixos. XGBoost 2.0.3, scikit-learn 1.5.0, NumPy 1.26.4 e pandas 2.2.2. Mesmo treinamento e teste dentro de cada cenário, semente do classificador fixa e limite de threads.

As partições agrupam vetores completos idênticos para evitar duplicatas atravessando treino, validação e teste:

- Suspensão: 12.081 / 3.892 / 4.027 registros.
- Fabricação: 11.944 / 3.994 / 4.062 registros.

Valores abaixo são medianas de 30 sementes para G-FShield e monólito; os comparadores fixos têm uma avaliação cada.

| Cenário | Método | Atributos | Redução | Macro-F1 teste | F1 positivo |
| --- | --- | ---: | ---: | ---: | ---: |
| Suspensão | Todos os atributos | 688 | 0% | 0,734966 | 0,532915 |
| Suspensão | Subconjunto histórico IWShap | 16 | 97,67% | 0,830048 | 0,699894 |
| Suspensão | G-FShield | 20,5 | 97,02% | 0,723518 | 0,511074 |
| Suspensão | Monólito pareado | 21 | 96,95% | 0,723544 | 0,510315 |
| Fabricação | Todos os atributos | 688 | 0% | 0,882397 | 0,795019 |
| Fabricação | Subconjunto histórico IWShap | 4 | 99,42% | 0,882423 | 0,799667 |
| Fabricação | G-FShield | 17 | 97,53% | 0,887680 | 0,803178 |
| Fabricação | Monólito pareado | 17 | 97,53% | 0,889053 | 0,805639 |

**Leitura de fabricação:** ganho descritivo de aproximadamente 0,005258 de macro-F1, ou 0,526 ponto percentual, sobre o subconjunto IWShap. Foram 26/30 execuções acima em macro-F1, mas somente 16/30 em F1 positivo. O monólito apresentou mediana ainda maior que a distribuída; portanto, o ganho externo não pode ser atribuído automaticamente à distribuição.

**Leitura de suspensão:** o G-FShield ficou aproximadamente 0,106530 abaixo em macro-F1, ou 10,653 pontos percentuais. Nenhuma das 30 execuções superou o subconjunto IWShap. A mediana também ficou abaixo da referência com todos os atributos.

### 4.4. A ressalva mais importante para segurança: precisão e revocação

| Fabricação, classe de ataque | IWShap fixo | G-FShield, mediana | Diferença descritiva |
| --- | ---: | ---: | ---: |
| Precisão | 0,675562 | 0,787196 | +11,163 pontos percentuais |
| Revocação | 0,979633 | 0,820774 | −15,886 pontos percentuais |
| Atributos | 4 | 17 | Mais atributos no G-FShield |

O G-FShield teve maior proporção de acertos entre suas previsões positivas, mas recuperou menor proporção dos ataques. Para segurança, não basta apresentar o pequeno ganho de F1: deixar mais ataques passar pode ser mais importante que elevar a precisão. A preferência depende do custo de falsos negativos e falsos positivos, ainda não estabelecido operacionalmente.

O máximo de macro-F1 do G-FShield em fabricação foi **0,900957982939**, com F1 positivo **0,826347305389**. Houve resultados empatados nesse máximo; não se deve apresentá-lo como uma execução única ou como desempenho típico. Máximos não demonstram superioridade estatística.

### 4.5. Limitações dessa comparação externa

- Reavaliamos o subconjunto histórico IWShap, não repetimos sua seleção dentro de cada novo split.
- O subconjunto histórico pode incorporar informação do corpus antes da partição usada aqui; sua seleção não tem garantia de independência do nosso teste. O teste foi reservado à seleção G-FShield, mas isso não retroativamente torna a seleção histórica independente.
- Um comparador fixo não fornece 30 réplicas independentes do IWShap; contagens 26/30 são descritivas.
- A busca G-FShield foi orientada por J48; XGBoost mede transferência dos subconjuntos a outro avaliador, não otimização nativa para XGBoost.
- Duplicatas completas foram agrupadas, mas isso não garante independência temporal ou ausência de dependência entre mensagens CAN.
- O resultado histórico 0,918619 não deve ser comparado diretamente com nosso macro-F1: além do protocolo, ele é F1 positivo.
- Não há evidência de que o G-FShield domine simultaneamente F1, revocação, redução dimensional e tempo.

**Conclusão externa:** é defensável relatar vantagem descritiva de F1 em fabricação sob o avaliador comum, acompanhada das perdas de revocação e redução; não é defensável afirmar que o G-FShield superou o IWShap em geral.

## 5. Arquitetura no X-CANIDS: mesmo algoritmo, J48

As 120 buscas formais terminaram válidas em 12/09/2026. Cada cenário teve 30 pares, seleção de 1.080 s dentro do teto de 1.200 s e orçamento agregado de seis CPUs/12 GiB.

| Medida mediana | Suspensão G-FShield / monólito | Fabricação G-FShield / monólito |
| --- | --- | --- |
| Macro-F1 teste | 0,790717 / 0,787396 | 0,902245 / 0,900280 |
| Avaliações IWSSR/s | 8,580 / 3,698 | 8,302 / 3,678 |
| CPU-s estimados | 3.853,1 / 1.100,7 | 3.858,4 / 1.096,9 |
| Pico RAM, MiB | 3.370,3 / 770,1 | 3.169,8 / 774,6 |
| Tempo ao baseline, s | 114,463 / 92,071 | 101,047 / 90,091 |
| AUC da trajetória de qualidade | 0,724464 / 0,733062 | 0,831286 / 0,839406 |

A sobreposição construção–busca excedeu 99,65% no distribuído, contra zero no sequencial. A vazão foi aproximadamente 2,3 vezes maior, mas o consumo estimado de CPU foi aproximadamente 3,5 vezes maior.

As diferenças de F1 não foram significativas após Holm: p=0,438598 em suspensão e p=1 em fabricação. Ausência de significância **não comprova equivalência**. A AUC favoreceu o monólito nos dois cenários. Tempo ao baseline é descritivo porque o limiar não constava no manifesto congelado.

Os custos antigos são estimativas derivadas da amostragem; não se confundem com integrais temporais da v13 nem com contadores cumulativos exatos.

## 6. ERENO: resultados positivos e negativos das campanhas

### 6.1. Campanha inicial

Corpus de 199.998 registros, 51 preditores e nove classes. Oito sementes em 27 braços, teto de oito CPUs/16 GiB. Doze tentativas sem solução completa foram repetidas, até obter 216 válidas.

| Método | Macro-F1 mediano | Atributos |
| --- | ---: | ---: |
| G-FShield ReliefF–VND–IWSSR | 0,9448 | 11 |
| Monólito 1, GR–BitFlip | 0,9397 | 5 |
| Monólito 2, GR–IWSS | 0,8411 | 5 |
| Todas as características | 0,9378 | 51 |

A configuração distribuída foi selecionada pela validação. Mostrou qualidade competitiva e redução de 78,4%, mas não houve comparação significativa entre as 72 exploratórias após Holm. Os algoritmos diferentes impedem atribuir o resultado exclusivamente à arquitetura.

A qualidade não é uniforme entre ataques: na configuração selecionada, F1 mediano de grayhole foi 0,7179 e de normal 0,8451. A macro média próxima de 0,945 não significa detecção igualmente boa de todas as classes.

A antiga divergência 25.873/25.836 corresponde a linhas brutas versus linhas com F1 válido. Esses registros internos não são somados às réplicas das novas campanhas.

### 6.2. v9: mecanismo e vazão positivos, latência negativa

Trinta pares, mesmo ReliefF–VND–IWSSR, 2.700 s de seleção, seis CPUs/12 GiB. Sete tentativas distribuídas falharam ao inicializar Kafka/ZooKeeper e foram repetidas.

- Vazão mediana: 0,1074 contra 0,0739 avaliações/s; vantagem em todos os 30 pares.
- Sobreposição mediana: 99,998% contra zero.
- Até F1 de validação 0,94: diferença pareada mediana de **+422,740 s**, desfavorável ao distribuído; 23 derrotas e sete vitórias.
- CPU mediana: 4,076 contra 1,004 núcleos.
- Salvaguarda de F1 não satisfeita: limite inferior unilateral −0,005615, abaixo da margem −0,005.

A sobreposição existe, mas não implica atingir a primeira boa solução mais cedo.

### 6.3. v10: vantagem delimitada confirmada

Trinta pares com sementes 72–101, novos em relação à v9, mesmo split e orçamento. Primário: subconjuntos distintos **avaliados internamente** com F1 de validação ≥0,945 em 2.700 s.

- Medianas: G-FShield 1; monólito 0.
- Diferença média pareada: **+0,933 subconjunto/execução**.
- IC95%: **[0,233; 1,667]**; p unilateral pareado **0,010135**.
- Vitórias/empates/derrotas: **13/12/5**; a mediana da diferença pareada é zero.
- Salvaguarda de F1 satisfeita: limite inferior −0,003791, acima de −0,005.

É a evidência mais direta de uma vantagem específica frente ao monólito sequencial. Não demonstra vantagem universal, nem superioridade frente a monólito paralelo. A contagem interna não equivale à quantidade de soluções publicadas para consumo externo.

### 6.4. v11: mais workers não comprovou maior rendimento

Cem execuções válidas, 25 sementes, monólito e distribuído com um, dois ou quatro workers.

Com quatro workers, a vazão mediana subiu de 0,07185 para 0,11333 avaliações/s, aproximadamente 57,7%. CPU passou de 1,004 para 4,138 núcleos e RAM mediana de 1.326,6 para 4.514,4 MiB.

O efeito primário de escalonamento da AUC não foi confirmado: p=0,216439. A média da AUC não cresceu monotonicamente de dois para quatro workers, e a salvaguarda de qualidade também não foi satisfeita. Portanto, essa campanha não comprova escalabilidade de rendimento.

### 6.5. Piloto v12: memoização e paralelismo de vizinhança

Nove configurações, uma semente, janela de 600 s. O monólito obteve macro-F1 0,944507; os distribuídos ficaram entre 0,869659 e 0,883367.

A memoização, quando ligada, reutilizou somente três a cinco avaliações por célula. Contadores distinguiram treinamento efetivo de reuso. Isso é diagnóstico, não demonstração de ganho robusto. As 99 células formais planejadas não foram executadas.

Memoização de resultados ficou **desligada** nos estudos v13/v14. Cache de leitura do dataset não substitui o treinamento de cada candidato.

### 6.6. v13: otimização específica confirmada

Cem execuções, 20 sementes, cinco braços, 2.700 s de seleção e mesmo teto agregado de seis CPUs/12 GiB.

A métrica primária é a área sob a contagem acumulada de subconjuntos distintos **publicados** com F1 de validação ≥0,945, normalizada pelo prazo. Não é AUC-ROC e não é a mesma métrica da v9.

| Braço | AUC publicada média | Atingiram limiar | Macro-F1 teste mediano | Avaliações/s medianas |
| --- | ---: | ---: | ---: | ---: |
| Monólito sequencial | 0,272179 | 5/20 | 0,944820 | 0,07352 |
| Distribuído e0-b0 | 0,275722 | 10/20 | 0,944993 | 0,11926 |
| Distribuído e0-b3 | 0,301599 | 11/20 | 0,945189 | 0,12574 |
| Distribuído e1-b0 | 0,370616 | 10/20 | 0,944993 | 0,11759 |
| Distribuído e1-b3 | 0,390210 | 11/20 | 0,945189 | 0,12444 |

e=publicação antecipada; b=limite adicional de treinamentos simultâneos, zero sem limite adicional, três com teto de três.

O efeito principal do limite três foi +0,022736 de AUC, IC95% [0,009612; 0,036565], p ajustado por Holm=0,011719. Equivale a cerca de 7% da média dos braços sem limite adicional. É evidência de otimização do G-FShield, não prova isolada de superioridade sobre o monólito.

Publicação antecipada não teve efeito confirmado: p ajustado=0,164063. O contraste e1-b3 versus monólito teve IC95% de AUC [−0,058122; 0,282105], incluindo zero.

Custos medianos observados de e1-b3: 3,1009 CPU-h contra 0,8150 e 3,1099 GiB-h contra 0,9389. Aproximadamente **3,80× CPU e 3,31× memória integrada**. Não há ganho de eficiência por recurso demonstrado.

Máximo de macro-F1 no teste: distribuídos 0,947131788166; monólito 0,945967735184. São máximos descritivos, não comparáveis diretamente aos máximos X-CANIDS.

### 6.7. Piloto v14-r2 e estado atual

Concluído com quatro células, semente 199 e seleção de 600 s.

| Braço | Avaliações concluídas dentro do prazo | Subconjuntos únicos |
| --- | ---: | ---: |
| Monólito sequencial | 55 | 50 |
| Monólito paralelo n3 | 85 | 77 |
| G-FShield w1-n3 | 77 | 71 |
| G-FShield w3-n3 | 75 | 68 |

Todos tiveram macro-F1 final de teste 0,945616335432. Candidatos tardios não entram nas contagens.

Este piloto sugere que parte da vantagem de vazão sobre o monólito sequencial pode vir do paralelismo, e não necessariamente da distribuição. Uma semente não permite concluir superioridade de nenhum braço.

O primeiro piloto teve problema de montagem/caminho de dados e não produziu evidência de qualidade utilizável; o r2 preservou a rastreabilidade dos dados. A campanha formal planejada, 20 sementes × quatro braços = 80 execuções, **não foi iniciada** até a consulta deste relatório.

## 7. Carga concorrente: resultado negativo que precisa aparecer

Já foram feitos testes com 1, 2, 4, 8 e 16 solicitações independentes, nos dois cenários CAN, sob teto agregado de seis CPUs/12 GiB.

A campanha original foi reduzida a cinco sementes de lote e 100 células. Não deve ser descrita como confirmação com 30 sementes. Nas cargas 8 e 16, a mediana de jobs qualificados foi **zero no G-FShield contra oito e 16 no monólito**, respectivamente.

Depois, dois perfis adicionaram 50 células cada:

- Rebalanceamento: três CPUs para RCL e uma para IWSSR.
- RCL replicada: até quatro réplicas dividindo o orçamento da RCL.

As otimizações recuperaram parte do trabalho: em carga 16, mediana de três jobs qualificados contra 16 no monólito. Não confirmaram vantagem arquitetural sob alta carga. Menor consumo em uma execução que termina muito menos trabalho não prova eficiência.

Os mesmos comparadores monolíticos originais foram reutilizados por checksum. Isso não constitui mais 100 réplicas independentes de monólito. Uma célula monolítica de fabricação/carga 16 teve amostragem de recursos incompleta; seu par foi excluído dessa análise de recursos, sem imputar zero.

## 8. Engenharia e observabilidade

Pontos positivos:

- Contratos de resultado, IDs, sementes, commits, imagens, hashes e estados persistentes permitem relacionar execução e artefatos.
- Testes do supervisor cobriram encerramento, checkpoint, retomada, órfãos e rotação de logs.
- Ablação de filtro em lote removeu um gargalo antes da campanha CAN; era um diagnóstico de duas células, não teste de superioridade.
- As campanhas recentes distinguem registros internos, candidatos únicos, treinamentos, reusos e publicações.

Limitações:

- Testar retomada do supervisor não demonstra resiliência do Kafka, do backend ou de toda a aplicação.
- Faltam medidas de perda/duplicação de eventos, recuperação, reprocessamento e overhead da telemetria.
- Na v13, publicação é o evento registrado pelo verificador, não ACK do broker nem recebimento por cliente.
- Recursos são amostrados. Na v13 a cobertura mínima foi 97,96% com critério de lacuna de 120 s; a sensibilidade de 60 s reduz a cobertura mínima a 90,52%.
- Não foram medidos consumo de energia, latência de detecção de pacotes em produção ou escalabilidade multihost.

## 9. O que pode ser defendido e o que não pode

| Afirmação | Situação |
| --- | --- |
| Construção e busca local se sobrepõem no G-FShield | Demonstrada nas configurações estudadas |
| G-FShield aumenta a vazão interna frente ao sequencial | Sustentada em várias campanhas |
| Pode produzir mais subconjuntos qualificados no prazo | Sustentada especificamente pela v10 |
| Limitar treinamento a três melhora a configuração distribuída | Sustentada especificamente pela v13 |
| Reduz bastante atributos mantendo qualidade competitiva | Sustentada em configurações/cenários delimitados |
| Supera IWShap em fabricação | Somente vantagem descritiva de F1 frente ao subconjunto fixo; há perdas em outras métricas |
| Supera IWShap em suspensão | Contradita pelos resultados disponíveis |
| É sempre mais rápido ou econômico | Não sustentada; vários resultados desfavoráveis |
| Mais workers sempre trazem mais soluções úteis | Não sustentada pela v11 |
| É superior a um monólito paralelo | Ainda sem campanha formal concluída |
| É resiliente, escalável entre hosts ou pronto para operação contínua | Não demonstrada pelos ensaios atuais |

## 10. Prioridades para fortalecer a dissertação

1. Concluir a comparação formal v14 com monólito paralelo, sem mudar hipótese após olhar resultados e sem excluir resultados negativos.
2. Integrar v11–v14 e os estudos de carga nas versões PT/EN. Este relatório não alterou as dissertações nem compilou novos PDFs.
3. Para IWShap, executar futuramente ambos os seletores dentro das mesmas partições, usando treinamento/validação para seleção e teste realmente reservado para ambos. Repetir splits/sementes e registrar custo de seleção.
4. Definir requisitos de segurança antes de otimizar: mínimo de revocação por ataque, limite de falsos alarmes e latência relevante. Usar validação para escolher limiares; não ajustar pelo teste atual.
5. Medir CPU por contadores cumulativos e latência por eventos correlacionados; separar inicialização, leitura/projeção, treino, filas, publicação e avaliação final.
6. Perfilar cópias de dados, alocação/GC, instrumentação e distribuição dos limites de CPU antes de propor novas otimizações. Alterações algorítmicas devem ser comparadas também no monólito.
7. Reservar novas partições ou dados para confirmação final: várias campanhas no mesmo split não equivalem a várias confirmações independentes de generalização.
8. Tratar falhas e múltiplos hosts como hipóteses próprias, se forem parte da contribuição pretendida.

## 11. Fontes, auditoria e preservação

Fontes locais principais, a partir da raiz do repositório:

- `docs/dissertation-review/relatorio-consolidado-experimentos-2026-09-19.md`.
- `docs/dissertation-review/iwshap-comparison-final-report.md`.
- `docs/dissertation-review/experiment-10d-analysis/`.
- `docs/dissertation-review/architecture-causal-analysis/`.
- `docs/dissertation-review/architecture-quality-yield-analysis/`.
- `docs/dissertation-review/iwshap-comparison-analysis/`.
- `Dissertação_Nicolas/textuais/avaliacao.tex` e `avaliacao-iwshap.tex`.
- `.worktrees/performance-v12/experiments/iwshap-comparison/CONCURRENT_LOAD_STATUS.md`.
- `.worktrees/performance-v12/experiments/performance-v12/evidence/v11/pipeline-ablation-result.json`.
- `.worktrees/performance-v12/experiments/performance-v12/STATUS_2026-09-23.md`.
- `.worktrees/performance-v12/experiments/performance-v13/ANALISE_RESULTADOS.md` e JSONs vinculados.
- `.worktrees/performance-v12/experiments/performance-v14/`.

O nome histórico do worktree é performance-v12; a branch de trabalho atual é experiment/performance-v14.

Nesta consulta foram lidos estados e agregados persistentes no servidor, incluindo v9, v10, v11, v12, v13, v14-r2, campanha CAN e reprodução original. Os 124 JSONs XGBoost foram novamente agregados, e o macro-F1 foi recalculado a partir das matrizes de confusão: **zero divergências acima de 1e-12**.

Fingerprint SHA-256 dos 124 resultados XGBoost lidos:
`b49e6b7ddcf059b7c623a04e983c8bda6873ab18b72565536ca27c9c2c98d0cd`.

Cálculo: ordenar os caminhos relativos dos arquivos */*/final-result.json; concatenar uma linha por arquivo com caminho relativo, tabulação, SHA-256 do conteúdo e quebra LF; aplicar SHA-256 ao texto UTF-8 resultante. Esse fingerprint identifica a leitura atual; não substitui comparação com um manifesto histórico previamente congelado.

As auditorias integrais de 1.500 arquivos CAN e 1.220 artefatos v13 são as registradas nos relatórios anteriores, não uma alegação de que todos foram recalculados novamente nesta consulta.

A orientação da skill de planilhas foi usada na conferência dos agregados: preservação de medições originais, unidades explícitas e rastreabilidade. Não foi criada ou alterada planilha.

Este relatório é uma nova cópia local: não sobrescreve o de 19/09, não altera experimentos, código ou dados, e não publica logs/configurações internas. Nenhuma campanha foi iniciada para produzi-lo.
