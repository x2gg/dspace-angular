import { ComponentFixture, fakeAsync, TestBed, waitForAsync } from '@angular/core/testing';
import { ItemDataService } from '../../core/data/item-data.service';
import { TranslateLoader, TranslateModule, TranslateService } from '@ngx-translate/core';
import { TranslateLoaderMock } from '../../shared/mocks/translate-loader.mock';
import { ChangeDetectionStrategy, NO_ERRORS_SCHEMA, PLATFORM_ID } from '@angular/core';
import { TruncatePipe } from '../../shared/utils/truncate.pipe';
import { FullItemPageComponent } from './full-item-page.component';
import { MetadataService } from '../../core/metadata/metadata.service';
import { ActivatedRoute } from '@angular/router';
import { ActivatedRouteStub } from '../../shared/testing/active-router.stub';
import { VarDirective } from '../../shared/utils/var.directive';
import { RouterTestingModule } from '@angular/router/testing';
import { Item } from '../../core/shared/item.model';
import { BehaviorSubject, of, of as observableOf } from 'rxjs';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { createSuccessfulRemoteDataObject, createSuccessfulRemoteDataObject$ } from '../../shared/remote-data.utils';
import { AuthService } from '../../core/auth/auth.service';
import { createPaginatedList } from '../../shared/testing/utils.test';
import { AuthorizationDataService } from '../../core/data/feature-authorization/authorization-data.service';
import { createRelationshipsObservable } from '../simple/item-types/shared/item.component.spec';
import { RemoteData } from '../../core/data/remote-data';
import { RegistryService } from 'src/app/core/registry/registry.service';
import { Store } from '@ngrx/store';
import { NotificationsService } from 'src/app/shared/notifications/notifications.service';
import { MetadataFieldDataService } from 'src/app/core/data/metadata-field-data.service';
import { MetadataSchemaDataService } from 'src/app/core/data/metadata-schema-data.service';
import { MetadataBitstreamDataService } from 'src/app/core/data/metadata-bitstream-data.service';
import { getMockTranslateService } from 'src/app/shared/mocks/translate.service.mock';
import { ConfigurationProperty } from '../../core/shared/configuration-property.model';
import { HALEndpointService } from '../../core/shared/hal-endpoint.service';
import { cold } from 'jasmine-marbles';

const mockItem: Item = Object.assign(new Item(), {
  bundles: createSuccessfulRemoteDataObject$(createPaginatedList([])),
  metadata: {
    'dc.title': [
      {
        language: 'en_US',
        value: 'test item'
      }
    ]
  }
});

const mockWithdrawnItem: Item = Object.assign(new Item(), {
  bundles: createSuccessfulRemoteDataObject$(createPaginatedList([])),
  metadata: [],
  relationships: createRelationshipsObservable(),
  isWithdrawn: true
});

const metadataServiceStub = {
  /* eslint-disable no-empty,@typescript-eslint/no-empty-function */
  processRemoteData: () => {
  }
  /* eslint-enable no-empty, @typescript-eslint/no-empty-function */
};

describe('FullItemPageComponent', () => {
  let comp: FullItemPageComponent;
  let fixture: ComponentFixture<FullItemPageComponent>;
  let registryService: RegistryService;
  let translateService: TranslateService;
  let authService: AuthService;
  let routeStub: ActivatedRouteStub;
  let routeData;
  let authorizationDataService: AuthorizationDataService;

  beforeEach(waitForAsync(() => {
    authService = jasmine.createSpyObj('authService', {
      isAuthenticated: observableOf(true),
      setRedirectUrl: {}
    });

    routeData = {
      dso: createSuccessfulRemoteDataObject(mockItem),
    };

    routeStub = Object.assign(new ActivatedRouteStub(), {
      data: observableOf(routeData)
    });

    authorizationDataService = jasmine.createSpyObj('authorizationDataService', {
      isAuthorized: observableOf(false),
    });

    const mockMetadataBitstreamDataService = {
      searchByHandleParams: () => of({}) // Returns a mock Observable
    };

    const configurationDataService = jasmine.createSpyObj('configurationDataService', {
      findByPropertyName: createSuccessfulRemoteDataObject$(Object.assign(new ConfigurationProperty(), {
        name: 'test',
        values: [
          'org.dspace.ctask.general.ProfileFormats = test'
        ]
      }))
    });

    let halService: HALEndpointService;
    halService = jasmine.createSpyObj('halService', {
      'getEndpoint': cold('a', { a: 'endpointURL' })
    });


    translateService = getMockTranslateService();
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot({
        loader: {
          provide: TranslateLoader,
          useClass: TranslateLoaderMock
        }
      }), RouterTestingModule.withRoutes([]), BrowserAnimationsModule],
      declarations: [FullItemPageComponent, TruncatePipe, VarDirective],
      providers: [
        { provide: ActivatedRoute, useValue: routeStub },
        { provide: ItemDataService, useValue: {} },
        { provide: MetadataService, useValue: metadataServiceStub },
        { provide: AuthService, useValue: authService },
        { provide: AuthorizationDataService, useValue: authorizationDataService },
        { provide: MetadataBitstreamDataService, useValue: mockMetadataBitstreamDataService },
        { provide: Store, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: MetadataSchemaDataService, useValue: {} },
        { provide: MetadataFieldDataService, useValue: {} },
        { provide: HALEndpointService, useValue: halService },
        RegistryService
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).overrideComponent(FullItemPageComponent, {
      set: { changeDetection: ChangeDetectionStrategy.Default }
    }).compileComponents();
  }));

  beforeEach(waitForAsync(() => {
    registryService = TestBed.inject(RegistryService);
    fixture = TestBed.createComponent(FullItemPageComponent);
    comp = fixture.componentInstance;
    fixture.detectChanges();
  }));

  afterEach(() => {
    fixture.debugElement.nativeElement.remove();
  });

  it('should display the item\'s metadata', () => {
    const table = fixture.debugElement.query(By.css('table'));
    for (const metadatum of mockItem.allMetadata(Object.keys(mockItem.metadata))) {
      expect(table.nativeElement.innerHTML).toContain(metadatum.value);
    }
  });

  it('should show simple view button when not originated from workflow item', () => {
    waitForAsync(() => {
      expect(comp.fromSubmissionObject).toBe(false);
      const simpleViewBtn = fixture.debugElement.query(By.css('.simple-view-link'));
      expect(simpleViewBtn).toBeTruthy();
    });
  });

  it('should not show simple view button when originated from workflow', fakeAsync(() => {
    routeData.wfi = createSuccessfulRemoteDataObject$({ id: 'wfiId'});
    comp.ngOnInit();
    waitForAsync(() => {
      fixture.detectChanges();
      fixture.whenStable().then(() => {
        expect(comp.fromSubmissionObject).toBe(true);
        const simpleViewBtn = fixture.debugElement.query(By.css('.simple-view-link'));
        expect(simpleViewBtn).toBeFalsy();
      });
    });
  }));

  describe('when the item is withdrawn and the user is an admin', () => {
    beforeEach(() => {
      comp.isAdmin$ = observableOf(true);
      comp.itemRD$ = new BehaviorSubject<RemoteData<Item>>(createSuccessfulRemoteDataObject(mockWithdrawnItem));
      fixture.detectChanges();
    });

    it('should display the item', () => {
      const objectLoader = fixture.debugElement.query(By.css('.full-item-info'));
      expect(objectLoader.nativeElement).toBeDefined();
    });
  });
  describe('when the item is withdrawn and the user is not an admin', () => {
    beforeEach(() => {
      comp.itemRD$ = new BehaviorSubject<RemoteData<Item>>(createSuccessfulRemoteDataObject(mockWithdrawnItem));
      fixture.detectChanges();
    });

    it('should not display the item', () => {
      const objectLoader = fixture.debugElement.query(By.css('.full-item-info'));
      expect(objectLoader).toBeNull();
    });
  });

  describe('when the item is not withdrawn and the user is an admin', () => {
    beforeEach(() => {
      comp.isAdmin$ = observableOf(true);
      comp.itemRD$ = new BehaviorSubject<RemoteData<Item>>(createSuccessfulRemoteDataObject(mockItem));
      fixture.detectChanges();
    });

    it('should display the item', () => {
      const objectLoader = fixture.debugElement.query(By.css('.full-item-info'));
      expect(objectLoader.nativeElement).toBeDefined();
    });
  });

  describe('when the item is not withdrawn and the user is not an admin', () => {
    beforeEach(() => {
      comp.itemRD$ = new BehaviorSubject<RemoteData<Item>>(createSuccessfulRemoteDataObject(mockItem));
      fixture.detectChanges();
    });

    it('should display the item', () => {
      const objectLoader = fixture.debugElement.query(By.css('.full-item-info'));
      expect(objectLoader.nativeElement).toBeDefined();
    });
  });
});
