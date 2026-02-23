/**
 * =======================================================================
 * CONFIG_ROUTE_OPTIMIZATION.GS - Paramètres d'Optimisation des Routes
 * =======================================================================
 * Contient : Tous les paramètres du clustering adaptatif et de l'optimisation
 * Contrôle : Diamètre max, compacité, préférence quartier, capacités véhicules
 */

/**
 * Paramètres pour l'algorithme de génération de routes
 */
const CONFIG_ROUTE_OPTIMIZATION = {
    /**
     * Distance en km pour considérer 2 livraisons comme "proches"
     */
    get DISTANCE_PROXIMITE_KM() {
        return parseFloat(
            PropertiesService.getScriptProperties().getProperty('ROUTE_DISTANCE_PROXIMITE_KM') || '2.5'
        );
    },

    /**
     * Distance maximum (diamètre) d'un cluster en km
     * CRITIQUE : Empêche les clusters allongés/inefficaces
     */
    get MAX_CLUSTER_DIAMETER_KM() {
        return parseFloat(
            PropertiesService.getScriptProperties().getProperty('ROUTE_MAX_CLUSTER_DIAMETER_KM') || '5'
        );
    },

    /**
     * Distance max en km pour grouper 2 clusters différents dans une même route
     */
    get DISTANCE_CLUSTER_MAX_KM() {
        return parseFloat(
            PropertiesService.getScriptProperties().getProperty('ROUTE_DISTANCE_CLUSTER_MAX_KM') || '15'
        );
    },

    /**
     * Seuil en mètres pour considérer que 2 adresses sont identiques
     */
    get SAME_BUILDING_THRESHOLD_M() {
        return parseFloat(
            PropertiesService.getScriptProperties().getProperty('ROUTE_SAME_BUILDING_THRESHOLD_M') || '50'
        );
    },

    /**
     * Préférer les livraisons du même quartier lors du clustering
     */
    get QUARTIER_PREFERENCE() {
        return PropertiesService.getScriptProperties().getProperty('ROUTE_QUARTIER_PREFERENCE') !== 'false';
    },

    /**
     * Autoriser le regroupement de livraisons de quartiers différents
     */
    get ALLOW_CROSS_QUARTIER() {
        return PropertiesService.getScriptProperties().getProperty('ROUTE_ALLOW_CROSS_QUARTIER') !== 'false';
    },

    /**
     * Distance en km au-delà de laquelle une livraison est considérée "isolée/outlier"
     */
    get OUTLIER_DISTANCE_KM() {
        return parseFloat(
            PropertiesService.getScriptProperties().getProperty('ROUTE_OUTLIER_DISTANCE_KM') || '40'
        );
    },

    /**
     * Ratio minimum de compacité d'un cluster (0-1)
     */
    get MIN_COMPACTNESS_RATIO() {
        return parseFloat(
            PropertiesService.getScriptProperties().getProperty('ROUTE_MIN_COMPACTNESS_RATIO') || '0.4'
        );
    },

    /**
     * Distance en km au-delà de laquelle une route est considérée "éloignée"
     */
    get DISTANCE_LIVRAISON_ISOLEE_KM() {
        return parseFloat(
            PropertiesService.getScriptProperties().getProperty('ROUTE_DISTANCE_ISOLEE_KM') || '30'
        );
    },

    /**
     * Distance en km pour regrouper des clusters très éloignés ensemble
     */
    DISTANCE_REGROUPE_ELOIGNES_KM: 30
};