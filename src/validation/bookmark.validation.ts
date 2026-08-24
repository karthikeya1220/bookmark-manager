import { GraphQLError } from 'graphql';

export function validateTitle(title: string): string {
  if (title === null || title === undefined) {
    throw new GraphQLError('Bookmark title cannot be empty');
  }
  const trimmed = title.trim();
  if (trimmed === '') {
    throw new GraphQLError('Bookmark title cannot be empty');
  }
  return trimmed;
}

export function validateUrl(urlString: string): string {
  if (urlString === null || urlString === undefined) {
    throw new GraphQLError('Invalid bookmark URL');
  }
  const trimmed = urlString.trim();
  if (trimmed === '') {
    throw new GraphQLError('Invalid bookmark URL');
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new GraphQLError('Invalid bookmark URL');
    }
    return url.href;
  } catch {
    throw new GraphQLError('Invalid bookmark URL');
  }
}
