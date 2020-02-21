"use strict";

export class SearchRequestAdapter {
  static get INDEX_NAME_MATCHING_REGEX() {
    return new RegExp("^(.+?)(?=(/sort/(.*))|$)");
  }

  constructor(instantsearchRequest, typesenseClient, searchByFields) {
    this.instantsearchRequest = instantsearchRequest;
    this.typesenseClient = typesenseClient;
    this.searchByFields = searchByFields;
  }

  _adaptFacetFilters(facetFilters) {
    let adaptedResult = "";

    if (!facetFilters) {
      return adaptedResult;
    }

    const intermediateFacetFilters = {};

    // Need to transform:
    // faceFilters = [["facet1:value1", "facet1:value2"], "facet2:value3"]]
    //
    // Into this:
    // intermediateFacetFilters = {
    //     "facet1": ["value1", "value2"],
    //     "facet2": ["value1", "value2"]
    // }

    facetFilters.flat().forEach(facetFilter => {
      const [facetName, facetValue] = facetFilter.split(":");
      intermediateFacetFilters[facetName] =
        intermediateFacetFilters[facetName] || [];
      intermediateFacetFilters[facetName].push(facetValue);
    });

    // Need to transform this:
    // intermediateFacetFilters = {
    //     "facet1": ["value1", "value2"],
    //     "facet2": ["value1", "value2"]
    // }
    //
    // Into this:
    // facet1: [value1,value2] && facet2: [value1,value2]

    adaptedResult = Object.entries(intermediateFacetFilters)
      .map(([facet, values]) =>
        "".concat(facet, ": [").concat(values.join(","), "]")
      )
      .join(" && ");

    return adaptedResult;
  }

  _adaptNumericFilters(numericFilters) {
    let adaptedResult = "";

    if (!numericFilters) {
      return adaptedResult;
    }

    adaptedResult = numericFilters
      .map(numericFilter => numericFilter.replace(new RegExp("(>|<=)"), ":$1"))
      .join(" && ");

    return adaptedResult;
  }

  _adaptFilters(facetFilters, numericFilters) {
    const adaptedFilters = [];

    adaptedFilters.push(this._adaptFacetFilters(facetFilters));
    adaptedFilters.push(this._adaptNumericFilters(numericFilters));

    return adaptedFilters.filter(filter => filter !== "").join(" && ");
  }

  _adaptIndexName(indexName) {
    return indexName.match(this.constructor.INDEX_NAME_MATCHING_REGEX)[1];
  }

  _adaptSortBy(indexName) {
    return indexName.match(this.constructor.INDEX_NAME_MATCHING_REGEX)[3];
  }

  _buildSearchParameters() {
    const params = this.instantsearchRequest.params;
    const indexName = this.instantsearchRequest.indexName;
    const typesenseSearchParams = {
      q: params.query === "" ? "*" : params.query,
      query_by: this.searchByFields.join(","),
      facet_by: [params.facets].flat().join(","),
      filter_by: this._adaptFilters(params.facetFilters, params.numericFilters),
      sort_by: this._adaptSortBy(indexName),
      max_facet_values: params.maxValuesPerFacet,
      page: params.page + 1
    };

    if (params.facetQuery) {
      typesenseSearchParams.facet_query = `${params.facetName}:${params.facetQuery}`;
      typesenseSearchParams.max_hits = 1;
      typesenseSearchParams.per_page = 1;
    }

    if (params.hitsPerPage) {
      typesenseSearchParams.per_page = params.hitsPerPage;
    }

    // console.log(params);
    // console.log(typesenseSearchParams);

    return typesenseSearchParams;
  }

  async request() {
    return this.typesenseClient
      .collections(this._adaptIndexName(this.instantsearchRequest.indexName))
      .documents()
      .search(this._buildSearchParameters());
  }
}
