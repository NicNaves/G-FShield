package br.com.graspfs.ls.iwssr.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import br.com.graspfs.ls.iwssr.enuns.LocalSearch;
import lombok.*;

import java.util.ArrayList;
import java.util.UUID;

@Builder
@Setter
@Getter
@AllArgsConstructor
public class DataSolution {

    @JsonProperty("seedId")
    private UUID seedId;// id da mensagem

    @JsonProperty("solutionFeatures")
    private  ArrayList<Integer> solutionFeatures;// []

    @JsonProperty("rclfeatures") private  ArrayList<Integer> rclfeatures;// []

    @JsonProperty("neighborhood")
    private String neighborhood;// vnd

    @JsonProperty("enabledLocalSearches")
    private ArrayList<String> enabledLocalSearches;

    @JsonProperty("neighborhoodMaxIterations")
    private Integer neighborhoodMaxIterations;

    @JsonProperty("bitFlipMaxIterations")
    private Integer bitFlipMaxIterations;

    @JsonProperty("iwssMaxIterations")
    private Integer iwssMaxIterations;

    @JsonProperty("iwssrMaxIterations")
    private Integer iwssrMaxIterations;

    @JsonProperty("iterationNeighborhood")
    private Integer iterationNeighborhood; //01

    @JsonProperty("classfier")
    private String classfier;// J48

    @JsonProperty("f1Score")
    private Float f1Score;// 98%

    @JsonProperty("rclAlgorithm")
    private String rclAlgorithm;

    @JsonProperty("cpuUsage")
    private Float cpuUsage;

    @JsonProperty("memoryUsage")
    private Float memoryUsage;

    @JsonProperty("memoryUsagePercent")
    private Float memoryUsagePercent;

    @JsonProperty("accuracy")
    private Float accuracy;

    @JsonProperty("precision")
    private Float precision;

    @JsonProperty("recall")
    private Float recall;


    @JsonProperty("localSearch")
    private LocalSearch localSearch; // BF

    @JsonProperty("status")
    private String status;

    @JsonProperty("runnigTime")
    private Long runnigTime;// tempo de execução

    @JsonProperty("iterationLocalSearch")
    private Integer iterationLocalSearch; //01

    @JsonProperty("trainingFileName")
    private String trainingFileName; // nome do arquivo de treino

    @JsonProperty("testingFileName")
    private String testingFileName; // nome do arquivo de teste

    @JsonProperty("useTrainingCache")
    private Boolean useTrainingCache;

    
    public DataSolution() {
    }

    public String getLocalSearchName() {
        return localSearch != null ? localSearch.name() : null;
    }

}
