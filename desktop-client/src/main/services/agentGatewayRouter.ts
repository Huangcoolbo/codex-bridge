export type RouteMatch = {
  params: Record<string, string>
}

export type RouteDefinition = {
  method: string
  path: string
}

export function tokenizePath(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0)
}

export function matchRoute(routePath: string, pathname: string): RouteMatch | null {
  const routeSegments = tokenizePath(routePath)
  const pathSegments = tokenizePath(pathname)
  if (routeSegments.length !== pathSegments.length) {
    return null
  }

  const params: Record<string, string> = {}
  for (let index = 0; index < routeSegments.length; index += 1) {
    const routeSegment = routeSegments[index]
    const pathSegment = pathSegments[index]
    if (routeSegment.startsWith(":")) {
      params[routeSegment.slice(1)] = decodeURIComponent(pathSegment)
      continue
    }
    if (routeSegment !== pathSegment) {
      return null
    }
  }

  return { params }
}

export function resolveRoute<T extends RouteDefinition>(method: string, pathname: string, routes: T[]): { route: T, match: RouteMatch } | null {
  for (const route of routes) {
    if (route.method !== method) {
      continue
    }
    const match = matchRoute(route.path, pathname)
    if (match) {
      return { route, match }
    }
  }
  return null
}
