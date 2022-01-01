# Anime Image Search

## Installation:

```
yarn add anime-image-search
or
npm i anime-image-search
```

## How to use:

### Saucenao Search

```ts
import AnimeApi from 'anime-image-search';
import fs from 'fs';

(async () => {
  const api = new AnimeApi({
    saucenaoKey: 'YOUR_API_KEY'
  });

  const image = fs.createReadStream('/path/to/image'); // To use a ReadStream

  const image = fs.readFileSync('/path/to/image'); // To use a buffer

  const image = 'http://example.com/image.jpg'; // To use an url

  // OR you can pass the path directly api.saucenao('/path/to/image')

  const saucenaoSearch = await api.saucenao(image, {
    output_type: 2
    // Saucenao Options
  });
})();
```

See more saucenao options in [Saucenao](https://saucenao.com/user.php?page=search-api)

### IQDB Search

```ts
...
  const iqdb = await api.iqdb(image);
})();
```
