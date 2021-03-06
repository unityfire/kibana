import expect from 'expect.js';
import sinon from 'sinon';
import { geoHashBucketAgg } from 'ui/agg_types/buckets/geo_hash';
import * as AggConfigModule from 'ui/vis/agg_config';
import * as BucketAggTypeModule from 'ui/agg_types/buckets/_bucket_agg_type';
import { aggTypes } from 'ui/agg_types/index';

AggConfigModule.AggConfig.aggTypes = aggTypes;

describe('Geohash Agg', () => {

  const intialZoom = 10;
  const initialMapBounds = {
    top_left: { lat: 1.0, lon: -1.0 },
    bottom_right: { lat: -1.0, lon: 1.0 }
  };
  const aggMock = {
    getField: () => {
      return {
        name: 'location'
      };
    },
    params: {
      isFilteredByCollar: true,
      useGeocentroid: true
    },
    vis: {
      hasUiState: () => {
        return false;
      },
      params: {
        mapZoom: intialZoom
      },
      sessionState: {},
      aggs: []
    },
    type: 'geohash_grid',
  };
  const BucketAggTypeMock = (aggOptions) => {
    return aggOptions;
  };
  const AggConfigMock = (vis, aggOptions) => {
    return aggOptions;
  };

  before(function () {
    sinon.stub(AggConfigModule, 'AggConfig', AggConfigMock);
    sinon.stub(BucketAggTypeModule, 'BucketAggType', BucketAggTypeMock);
  });

  after(function () {
    AggConfigModule.AggConfig.restore();
    BucketAggTypeModule.BucketAggType.restore();
  });


  function initVisSessionState() {
    aggMock.vis.sessionState = {
      mapBounds: initialMapBounds
    };
  }

  function initAggParams() {
    aggMock.params.isFilteredByCollar = true;
    aggMock.params.useGeocentroid = true;
  }

  function zoomMap(zoomChange) {
    aggMock.vis.params.mapZoom += zoomChange;
  }

  function moveMap(newBounds) {
    aggMock.vis.sessionState.mapBounds = newBounds;
  }

  function resetMap() {
    aggMock.vis.params.mapZoom = intialZoom;
    aggMock.vis.sessionState.mapBounds = initialMapBounds;
    aggMock.vis.sessionState.mapCollar = {
      top_left: { lat: 1.5, lon: -1.5 },
      bottom_right: { lat: -1.5, lon: 1.5 },
      zoom: intialZoom
    };
  }

  describe('precision parameter', () => {

    const PRECISION_PARAM_INDEX = 6;
    let precisionParam;
    beforeEach(() => {
      precisionParam = geoHashBucketAgg.params[PRECISION_PARAM_INDEX];
    });

    it('should select precision parameter', () => {
      expect(precisionParam.name).to.equal('precision');
    });

    describe('precision parameter write', () => {

      const zoomToGeoHashPrecision = {
        0: 1,
        1: 2,
        2: 2,
        3: 2,
        4: 3,
        5: 3,
        6: 4,
        7: 4,
        8: 4,
        9: 5,
        10: 5,
        11: 6,
        12: 6,
        13: 6,
        14: 7,
        15: 7,
        16: 7,
        17: 7,
        18: 7,
        19: 7,
        20: 7,
        21: 7
      };

      Object.keys(zoomToGeoHashPrecision).forEach((zoomLevel) => {
        it(`zoom level ${zoomLevel} should correspond to correct geohash-precision`, () => {
          const output = { params: {} };
          precisionParam.write({
            vis: {
              hasUiState: () => true,
              uiStateVal: () => zoomLevel
            },
            params: {
              autoPrecision: true
            }
          }, output);
          expect(output.params.precision).to.equal(zoomToGeoHashPrecision[zoomLevel]);
        });
      });
    });

  });

  describe('getRequestAggs', () => {

    describe('initial aggregation creation', () => {
      let requestAggs;
      beforeEach(() => {
        initVisSessionState();
        initAggParams();
        requestAggs = geoHashBucketAgg.getRequestAggs(aggMock);
      });

      it('should create filter, geohash_grid, and geo_centroid aggregations', () => {
        expect(requestAggs.length).to.equal(3);
        expect(requestAggs[0].type).to.equal('filter');
        expect(requestAggs[1].type).to.equal('geohash_grid');
        expect(requestAggs[2].type).to.equal('geo_centroid');
      });

      it('should set mapCollar in vis session state', () => {
        expect(aggMock.vis.sessionState).to.have.property('mapCollar');
        expect(aggMock.vis.sessionState.mapCollar).to.have.property('top_left');
        expect(aggMock.vis.sessionState.mapCollar).to.have.property('bottom_right');
        expect(aggMock.vis.sessionState.mapCollar).to.have.property('zoom');
      });

      // there was a bug because of an "&& mapZoom" check which excluded 0 as a valid mapZoom, but it is.
      it('should create filter, geohash_grid, and geo_centroid aggregations when zoom level 0', () => {
        aggMock.vis.params.mapZoom = 0;
        requestAggs = geoHashBucketAgg.getRequestAggs(aggMock);
        expect(requestAggs.length).to.equal(3);
        expect(requestAggs[0].type).to.equal('filter');
        expect(requestAggs[1].type).to.equal('geohash_grid');
        expect(requestAggs[2].type).to.equal('geo_centroid');
      });
    });

    describe('aggregation options', () => {

      beforeEach(() => {
        initVisSessionState();
        initAggParams();
      });

      it('should only create geohash_grid and geo_centroid aggregations when isFilteredByCollar is false', () => {
        aggMock.params.isFilteredByCollar = false;
        const requestAggs = geoHashBucketAgg.getRequestAggs(aggMock);
        expect(requestAggs.length).to.equal(2);
        expect(requestAggs[0].type).to.equal('geohash_grid');
        expect(requestAggs[1].type).to.equal('geo_centroid');
      });

      it('should only create filter and geohash_grid aggregations when useGeocentroid is false', () => {
        aggMock.params.useGeocentroid = false;
        const requestAggs = geoHashBucketAgg.getRequestAggs(aggMock);
        expect(requestAggs.length).to.equal(2);
        expect(requestAggs[0].type).to.equal('filter');
        expect(requestAggs[1].type).to.equal('geohash_grid');

      });
    });

    describe('aggregation creation after map interaction', () => {

      let origRequestAggs;
      let origMapCollar;
      beforeEach(() => {
        resetMap();
        initAggParams();
        origRequestAggs = geoHashBucketAgg.getRequestAggs(aggMock);
        origMapCollar = aggMock.vis.sessionState.mapCollar;
      });

      it('should not change geo_bounding_box filter aggregation and vis session state when map movement is within map collar', () => {
        moveMap({
          top_left: { lat: 1.1, lon: -1.1 },
          bottom_right: { lat: -0.9, lon: 0.9 }
        });

        const newRequestAggs = geoHashBucketAgg.getRequestAggs(aggMock);
        expect(JSON.stringify(origRequestAggs[0].params, null, '')).to.equal(JSON.stringify(newRequestAggs[0].params, null, ''));

        const newMapCollar = aggMock.vis.sessionState.mapCollar;
        expect(JSON.stringify(origMapCollar, null, '')).to.equal(JSON.stringify(newMapCollar, null, ''));
      });

      it('should change geo_bounding_box filter aggregation and vis session state when map movement is outside map collar', () => {
        moveMap({
          top_left: { lat: 10.0, lon: -10.0 },
          bottom_right: { lat: 9.0, lon: -9.0 }
        });

        const newRequestAggs = geoHashBucketAgg.getRequestAggs(aggMock);
        expect(JSON.stringify(origRequestAggs[0].params, null, '')).not.to.equal(JSON.stringify(newRequestAggs[0].params, null, ''));

        const newMapCollar = aggMock.vis.sessionState.mapCollar;
        expect(JSON.stringify(origMapCollar, null, '')).not.to.equal(JSON.stringify(newMapCollar, null, ''));
      });

      it('should change geo_bounding_box filter aggregation and vis session state when map zoom level changes', () => {
        zoomMap(-1);

        const newRequestAggs = geoHashBucketAgg.getRequestAggs(aggMock);
        expect(JSON.stringify(origRequestAggs[0].params, null, '')).not.to.equal(JSON.stringify(newRequestAggs[0].params, null, ''));

        const newMapCollar = aggMock.vis.sessionState.mapCollar;
        expect(JSON.stringify(origMapCollar, null, '')).not.to.equal(JSON.stringify(newMapCollar, null, ''));
      });

    });

  });
});
