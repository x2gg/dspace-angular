import { Component, OnInit } from '@angular/core';
import { GetRequest, PostRequest } from '../../core/data/request.models';
import {
  getFirstCompletedRemoteData, getFirstSucceededRemoteData,
  getFirstSucceededRemoteListPayload
} from '../../core/shared/operators';
import { ActivatedRoute } from '@angular/router';
import { RequestService } from '../../core/data/request.service';
import { NotificationsService } from '../../shared/notifications/notifications.service';
import { HALEndpointService } from '../../core/shared/hal-endpoint.service';
import { RemoteDataBuildService } from '../../core/cache/builders/remote-data-build.service';
import { TranslateService } from '@ngx-translate/core';
import { AuthenticatedAction } from '../../core/auth/auth.actions';
import { Store } from '@ngrx/store';
import { BehaviorSubject } from 'rxjs';
import { ConfigurationDataService } from '../../core/data/configuration-data.service';
import { ClarinVerificationTokenDataService } from '../../core/data/clarin/clarin-verification-token-data.service';
import { ClarinVerificationToken } from '../../core/shared/clarin/clarin-verification-token.model';
import { RequestParam } from '../../core/cache/models/request-param.model';
import { HttpOptions } from '../../core/dspace-rest/dspace-rest.service';
import { HttpHeaders } from '@angular/common/http';
import { AuthTokenInfo } from '../../core/auth/models/auth-token-info.model';
import { isEmpty } from '../../shared/empty.util';
import { CoreState } from 'src/app/core/core-state.model';
import { FindListOptions } from '../../core/data/find-list-options.model';
import { getBaseUrl } from '../../shared/clarin-shared-util';
import { ConfigurationProperty } from '../../core/shared/configuration-property.model';
import { RemoteData } from '../../core/data/remote-data';
import { HardRedirectService } from '../../core/services/hard-redirect.service';

/**
 * This component is showed up when the user has clicked on the `verification token`.
 * The component show to the user request headers which are passed from the IdP and after submitting
 * it tries to register and sign in the user.
 */
@Component({
  selector: 'ds-autoregistration',
  templateUrl: './autoregistration.component.html',
  styleUrls: ['./autoregistration.component.scss']
})
export class AutoregistrationComponent implements OnInit {

  /**
   * The verification token passed in the URL.
   */
  verificationToken = '';

  /**
   * Name of the repository retrieved from the configuration.
   */
  dspaceName$: BehaviorSubject<string> = new BehaviorSubject<string>(null);

  /**
   * ClarinVerificationToken object retrieved from the BE based on the passed `verificationToken`.
   * This object has ShibHeaders string value which is parsed and showed up to the user.
   */
  verificationToken$: BehaviorSubject<ClarinVerificationToken> = new BehaviorSubject<ClarinVerificationToken>(null);

  /**
   * Request headers which are passed by the IdP and are showed to the user.
   */
  shibHeaders$: BehaviorSubject<ShibHeader[]> = new BehaviorSubject<ShibHeader[]>(null);

  /**
   * UI URL loaded from the server.
   */
  baseUrl = '';

  /**
   * Show attributes passed from the IdP or not.
   * It could be disabled by the cfg property `authentication-shibboleth.show.idp-attributes`
   */
  showAttributes: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  constructor(public route: ActivatedRoute,
    private requestService: RequestService,
    protected halService: HALEndpointService,
    protected rdbService: RemoteDataBuildService,
    private notificationService: NotificationsService,
    private translateService: TranslateService,
    private configurationService: ConfigurationDataService,
    private verificationTokenService: ClarinVerificationTokenDataService,
    private store: Store<CoreState>,
    private hardRedirectService: HardRedirectService
  ) { }

  async ngOnInit(): Promise<void> {
    // Retrieve the token from the request param
    this.verificationToken = this.route?.snapshot?.queryParams?.['verification-token'];
    // Load the repository name for the welcome message
    this.loadRepositoryName();
    // Load the `ClarinVerificationToken` based on the `verificationToken` value
    this.loadVerificationToken();
    await this.assignBaseUrl();
    await this.loadShowAttributes().then((value: RemoteData<ConfigurationProperty>) => {
      const stringBoolean = value?.payload?.values?.[0];
      this.showAttributes.next(stringBoolean === 'true');
    });

    if (this.showAttributes.value === false) {
      this.autologin();
    }
  }

  /**
   * Try to authentificate the user - the authentication method automatically register the user if he doesn't exist.
   * If the authentication is successful try to login him.
   */
  public sendAutoregistrationRequest() {
    const requestId = this.requestService.generateRequestId();

    // Compose the URL for the ClarinAutoregistrationController.
    const url = this.halService.getRootHref() + '/autoregistration?verification-token=' + this.verificationToken;
    const getRequest = new GetRequest(requestId, url);
    // Send GET request
    this.requestService.send(getRequest);
    // Get response
    const response = this.rdbService.buildFromRequestUUID(requestId);
    // Process response
    response
      .pipe(getFirstSucceededRemoteData())
      .subscribe(responseRD$ => {
        if (responseRD$.hasSucceeded) {
          // Call autologin
          this.sendAutoLoginRequest();
        } else {
          // Show error message
          this.notificationService.error(this.translateService.instant('clarin.autoregistration.error.message'));
        }
      });
  }

  /**
   * The user submitted the Shibboleth headers.
   */
  public autologin() {
    this.sendAutoregistrationRequest();
  }

  /**
   * Call the ClarinShibbolethLoginFilter to authenticate the user. If the authentication is successful there is
   * an authorization token in the response which is passed to the `AuthenticationAction`. The `AuthenticationAction`
   * stores the token which is sent in every request.
   */
  private sendAutoLoginRequest() {
    // Prepare request headers
    const options: HttpOptions = Object.create({});
    let headers = new HttpHeaders();
    headers = headers.append('verification-token', this.verificationToken);
    options.headers = headers;
    // The response returns the token which is returned as string.
    options.responseType = 'text';

    // Prepare request
    const requestId = this.requestService.generateRequestId();
    // Compose the URL for the ClarinShibbolethLoginFilter
    const url = this.halService.getRootHref() + '/authn/shibboleth';
    const postRequest = new PostRequest(requestId, url, {}, options);
    // Send POST request
    this.requestService.send(postRequest);
    // Get response
    const response = this.rdbService.buildFromRequestUUID(requestId);
    response.pipe(getFirstSucceededRemoteData())
      .subscribe(responseRD$ => {
        if (responseRD$.hasSucceeded) {
          const token = Object.values(responseRD$?.payload).join('');
          const authToken = new AuthTokenInfo(token);
          this.store.dispatch(new AuthenticatedAction(authToken));
          this.deleteVerificationToken();
          // Use hard redirect to load all components from the beginning as the logged-in user. Because some components
          // are not loaded correctly when the user is logged in e.g., `log in` button is still visible instead of
          // log out button.
          const redirectUrl = this.baseUrl.endsWith('/')
            ? `${this.baseUrl}home`
            : `${this.baseUrl}/home`;
          this.hardRedirectService.redirect(redirectUrl);
        } else {
          this.notificationService.error(this.translateService.instant('clarin.autologin.error.message'));
        }
    });
  }

  /**
   * After every successful registration and login delete the verification token.
   */
  private deleteVerificationToken() {
    this.verificationTokenService.delete(this.verificationToken$.value.id)
      .pipe(getFirstCompletedRemoteData());
  }

  /**
   * Retrieve the `ClarinVerificationToken` object by the `verificationToken` value.
   */
  private loadVerificationToken() {
    this.verificationTokenService.searchBy('byToken', this.createSearchOptions(this.verificationToken))
      .pipe(getFirstSucceededRemoteListPayload())
      .subscribe(res => {
        console.log('res', res);
        if (isEmpty(res?.[0])) {
          return;
        }
        this.verificationToken$.next(res?.[0]);
        this.loadShibHeaders(this.verificationToken$?.value?.shibHeaders);
      });
  }

  /**
   * The verificationToken$ object stores the ShibHeaders which are stored as a string. Parse that string value
   * to the Array of the ShibHeader object for better rendering in the html.
   */
  private loadShibHeaders(shibHeadersStr: string) {
    const shibHeaders: ShibHeader[] = [];

    const splited = shibHeadersStr?.split('\n');
    splited.forEach(headerAndValue => {
      const endHeaderIndex = headerAndValue.indexOf('=');
      const startValueIndex = endHeaderIndex + 1;

      const header = headerAndValue.substr(0, endHeaderIndex);
      const value = headerAndValue.substr(startValueIndex);

      // Because cookie is big message
      if (header === 'cookie') {
        return;
      }
      const shibHeader: ShibHeader = Object.assign({}, {
        header: header,
        value: value
      });
      shibHeaders.push(shibHeader);
    });

    this.shibHeaders$.next(shibHeaders);
  }

  /**
   * Add the `token` search option to the request.
   */
  private createSearchOptions(token: string) {
    const params = [];
    params.push(new RequestParam('token', token));
    return Object.assign(new FindListOptions(), {
      searchParams: [...params]
    });
  }

  private loadRepositoryName() {
    this.configurationService.findByPropertyName('dspace.name')
      .pipe(getFirstCompletedRemoteData())
      .subscribe(res => {
        this.dspaceName$.next(res?.payload?.values?.[0]);
      });
  }

  async assignBaseUrl() {
    this.baseUrl = await getBaseUrl(this.configurationService)
      .then((baseUrlResponse: ConfigurationProperty) => {
        return baseUrlResponse?.values?.[0];
      });
  }

  /**
   * Load the `authentication-shibboleth.show.idp-attributes` property from the cfg
   */
  async loadShowAttributes(): Promise<any> {
    return await this.configurationService.findByPropertyName('authentication-shibboleth.show.idp-attributes')
      .pipe(
        getFirstCompletedRemoteData()
      ).toPromise();
  }
}
/**
 * ShibHeaders string value from the verificationToken$ parsed to the objects.
 */
export interface ShibHeader {
  header: string;
  value: string;
}
