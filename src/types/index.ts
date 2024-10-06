/**
 * @see https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.31/#userinfo-v1-authentication-k8s-io
 */
export interface UserInfo {
    username: string;
    uid: string;
    groups: string[];
    extra: Record<string, string[]>;
}

/**
 * @see https://pkg.go.dev/k8s.io/apimachinery/pkg/apis/meta/v1#GroupVersionResource
 */
export interface GroupVersionResource {
    group: string;
    version: string;
    resource: string;
}

/**
 * @see https://pkg.go.dev/k8s.io/apimachinery/pkg/apis/meta/v1#GroupVersionKind
 */
export interface GroupVersionKind {
    group: string;
    version: string;
    kind: string;
}

/**
 * @see https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.31/#statuscause-v1-meta
 */
export interface StatusCause {
    field: string;
    message: string;
    reason: string;
}

/**
 * @see https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.31/#statusdetails-v1-meta
 */
export interface StatusDetails {
    causes: StatusCause[];
    group: string;
    kind: string;
    name: string;
    retryAfterSeconds: number;
    uid: string;
}

/**
 * @see https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.31/#listmeta-v1-meta
 */
export interface ListMeta {
    continue: string;
    remainingItemCount: number;
    resourceVersion: string;
    selfLink: string;
}

/**
 * @see https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.31/#status-v1-meta
 */
export interface Status {
    apiVersion: string;
    code: number;
    details: StatusDetails;
    kind: string;
    message: string;
    metadata: ListMeta;
    reason: string;
    status: string;
}

/**
 * @see https://kubernetes.io/docs/reference/config-api/apiserver-admission.v1/#admission-k8s-io-v1-AdmissionRequest
 */
export interface AdmissionRequest {
    uid: string;
    kind: GroupVersionKind;
    resource: GroupVersionResource;
    subResource?: string;
    requestKind?: GroupVersionKind;
    requestResource?: GroupVersionResource;
    requestSubResource?: string;
    name?: string;
    namespace?: string;
    operation: string;
    userInfo: UserInfo;
    object?: Record<string, any>;
    oldObject?: Record<string, any>;
    dryRun?: boolean;
    options?: Record<string, any>;
}

/**
 * @see https://kubernetes.io/docs/reference/config-api/apiserver-admission.v1/#admission-k8s-io-v1-AdmissionResponse
 */
export interface AdmissionResponse {
    uid: string;
    allowed: boolean;
    status?: Status;
    patch?: string;
    patchType?: 'JSONPatch';
    auditAnnotations?: Record<string, string>;
    warnings?: string[];
}

/**
 * @see https://kubernetes.io/docs/reference/config-api/apiserver-admission.v1/#admission-k8s-io-v1-AdmissionReview
 */
export interface AdmissionReview {
    apiVersion: 'admission.k8s.io/v1';
    kind: string;
    request: AdmissionRequest;
    response: AdmissionResponse;
}
