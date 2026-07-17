export type RouteName = 'login' | 'workload' | 'detail' | 'settings';

export type PageComponent = {
  render(container: HTMLElement): void | Promise<void>;
  destroy?(): void;
};

type RouteEntry = {
  component: new () => PageComponent;
  page: PageComponent | null;
};

export class Router {
  private routes: Record<string, RouteEntry> = {};
  private currentPage: PageComponent | null = null;
  private container: HTMLElement;

  constructor(
    container: HTMLElement,
    routeMap: Record<string, new () => PageComponent>,
  ) {
    this.container = container;
    for (const [name, Component] of Object.entries(routeMap)) {
      this.routes[name] = { component: Component, page: null };
    }
  }

  start(): void {
    console.log('[Router] start() called, current hash:', window.location.hash);
    window.addEventListener('hashchange', () => this.navigate());
    // Kick off with current hash or default
    if (!window.location.hash) {
      console.log('[Router] no hash, setting #login');
      window.location.hash = '#login';
    } else {
      console.log('[Router] hash present, navigating');
      this.navigate();
    }
  }

  navigate(): void {
    const raw = window.location.hash.replace('#', '') || 'login';
    const [name, queryString] = raw.split('?') as [string, string | undefined];
    const routeName = name as RouteName;

    console.log('[Router] navigate() to:', routeName, 'params:', queryString);

    const params: Record<string, string> = {};
    if (queryString) {
      for (const pair of queryString.split('&')) {
        const [k, v] = pair.split('=');
        if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
      }
    }

    const route = this.routes[routeName];
    if (!route) {
      // Unknown route, go to login
      window.location.hash = '#login';
      return;
    }

    // Destroy previous page
    if (this.currentPage?.destroy) {
      this.currentPage.destroy();
    }

    // Clear container
    this.container.innerHTML = '';

    // Route params to dataset for pages to read
    this.container.dataset.route = routeName;
    this.container.dataset.params = JSON.stringify(params);

    // Create or reuse page instance
    if (!route.page) {
      route.page = new route.component();
    }

    route.page.render(this.container);
    this.currentPage = route.page;
    console.log('[Router] page rendered:', routeName);
  }
}
