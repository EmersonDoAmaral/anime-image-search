require('dotenv').config();
import cheerio from 'cheerio';
import FormData from 'form-data';
import axios, { AxiosRequestConfig } from 'axios';
import { ReadStream, createReadStream } from 'fs';

interface DefaultOptions {
  saucenaoKey?: string;
  axios?: {
    headers?: {
      UserAgent?: string;
    };
  };
}

interface SaucenaoOptions {
  output_type?: number;
  dbmask?: number;
  dbmaski?: number;
  db?: number;
  numres?: number;
  hide?: number;
  min_similarity?: number;
}

type ArtStationResponse = {
  ext_urls: string[];
  title?: string;
  as_project?: string;
  author_name?: string;
  author_url?: string;
};

type PixivResponse = {
  ext_urls: string[];
  title?: string;
  pixiv_id?: number;
  member_name?: string;
  member_id?: number;
};

type DevianArtResponse = {
  ext_urls: string[];
  title?: string;
  da_id?: string;
  author_name?: string;
  author_url?: string;
};

type DanbooruResponse = {
  ext_urls: string[];
  danbooru_id?: number;
  source?: string;
  material?: string;
  creator?: string;
  characters?: string;
};

type GelbooruResponse = Omit<DanbooruResponse, 'danbooru_id'> & {
  gelbooru_id?: number;
};

type AnimePicturesResponse = Omit<DanbooruResponse, 'danbooru_id'> & {
  'anime-pictures_id'?: number;
};

interface SaucenaoResponse {
  header: {
    source: string;
    similarity: string;
    thumbnail: string;
    index_id: number;
    index_name: string;
    dupes: number;
    hidden: number;
  };
  data: PixivResponse &
    ArtStationResponse &
    DevianArtResponse &
    GelbooruResponse &
    DanbooruResponse &
    AnimePicturesResponse;
}
const dOptions: DefaultOptions = {
  axios: {
    headers: {
      UserAgent:
        'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:15.0) Gecko/20100101 Firefox/15.0.1'
    }
  }
};

const saucenaoDefaultOptions: SaucenaoOptions = {
  output_type: 2,
  db: 999,
  numres: 10,
  hide: 3,
  min_similarity: 0
};

export default class Api {
  private options: DefaultOptions;
  private searchEngines: string[];

  constructor(options: DefaultOptions = {}) {
    this.options = { ...dOptions, ...options };

    this.searchEngines = ['https://saucenao.com', 'http://www.iqdb.org'];
  }
  private getSource(options: SaucenaoResponse[]) {
    for (let i = 0; i < options.length; i++) {
      switch (options[i].header.index_id) {
        case 5:
          options[i].header.source = 'Pixiv';
          break;
        case 9:
          options[i].header.source = 'Danbooru';
          break;
        case 25:
          options[i].header.source = 'Gelbooru';
          break;
        case 28:
          options[i].header.source = 'Anime-Pictures';
          break;
        case 34:
          options[i].header.source = 'DevianArt';
          break;
        case 39:
          options[i].header.source = 'ArtStation';
          break;
        case 41:
          options[i].header.source = 'Twitter';
          break;
        default:
          options[i].header.source = 'Unknown';
          break;
      }
    }

    return options;
  }
  /**
   * Receives a image to search in saucenao.
   *
   * @param {string|Buffer|ReadStream} image - The image to search.
   * @param {SaucenaoOptions} options - Saucenao Options.
   * @param {number} options.output_type - Output type.
   * @param {number} options.dbmask - Mask for enable specific indexes.
   * @param {number} options.dbmaski - Mask for disable specific indexes.
   * @param {number} options.db - Search for a specific index or 999 for all.
   * @param {number} options.numres - Max results.
   * @param {number} options.hide - Hide or show explict content.
   * @param {number} options.min_similarity - The minimum image similarity to return. Default: 0.
   *
   * @see https://saucenao.com/user.php?page=search-api
   *
   * @returns Returns an object array containing the more similars images.
   */
  async saucenao(
    image: string | Buffer | ReadStream,
    options: SaucenaoOptions
  ): Promise<SaucenaoResponse[]> {
    const opts = {
      ...saucenaoDefaultOptions,
      ...options,
      api_key: this.options.saucenaoKey
    };

    if (!this.options.saucenaoKey) {
      throw new Error(
        'To use saucenao search you need to use your own api key. Go to https://saucenao.com, register and get an api key.'
      );
    }

    const data = new FormData();

    Object.entries(opts).map((opt) => {
      data.append(opt[0], opt[1]);
    });

    if (image instanceof ReadStream) {
      data.append('file', image);
    } else if (typeof image === 'string') {
      if (/^https?:/.test(image)) {
        data.append('url', image);
      } else {
        data.append('file', createReadStream(image));
      }
    } else if (image instanceof Buffer) {
      data.append('file', image, 'image');
    } else {
      throw new Error(
        'Invalid image type, valid types: Path, url or ReadStream'
      );
    }

    const config: AxiosRequestConfig = {
      method: 'post',
      url: this.searchEngines[0] + '/search.php',
      data: data,
      headers: data.getHeaders()
    };

    const response = await axios(config).catch((err) => {
      console.log(err);
      if (err?.response?.status === 403) {
        throw new Error(`${err.response.statusText}, the api key is invalid.`);
      } else {
        throw new Error(`${err.response.status}. ${err.response.statusText}`);
      }
    });

    let results = response.data.results.filter((item: SaucenaoResponse) => {
      return parseFloat(item.header.similarity) >= opts.min_similarity!;
    });
    results = this.getSource(results);

    return results;
  }

  /**
   * Search an image in iqdb.
   *
   * @param {Buffer|string|ReadStream} image - The image to search.
   *
   * @returns A array containing similars images from IQDB
   * @see https://iqdb.org
   */
  async iqdb(image: string | ReadStream | Buffer): Promise<object[]> {
    const data = new FormData();

    if (image instanceof ReadStream) {
      data.append('file', image);
    } else if (typeof image === 'string') {
      if (/^https?:/.test(image)) {
        data.append('url', image);
      } else {
        data.append('file', createReadStream(image));
      }
    } else if (image instanceof Buffer) {
      data.append('file', image, 'image');
    } else {
      throw new Error(
        'Invalid image type, valid types: Path, url or ReadStream'
      );
    }

    const config: AxiosRequestConfig = {
      method: 'POST',
      url: this.searchEngines[1],
      headers: data.getHeaders(),
      data: data
    };

    const request = await axios(config);
    const html = request.data;

    const $ = cheerio.load(html);

    const images: object[] = [];

    $('div.pages#pages div').each((_, e) => {
      const isYourImage = 'table > tbody > tr:nth-child(1)';
      const imageUrlSelector = 'td.image > a';
      const similaritySelector = 'table > tbody > tr:nth-child(5) > td';
      const serviceSelector1 = 'table > tbody > tr:nth-child(3) > td';
      const serviceSelector2 =
        'table > tbody > tr:nth-child(3) > td > *:last-child';

      const eHtml = $(e).html();

      const el = cheerio.load(eHtml!);

      if (el(isYourImage).text() == 'Your image') {
        return;
      }

      let url = el(imageUrlSelector).attr('href');

      url =
        url?.includes('https') || url?.includes('http')
          ? el(imageUrlSelector).attr('href')
          : 'http:' + el(imageUrlSelector).attr('href');

      const similarity = el(similaritySelector).text();

      const service = el(serviceSelector2).text()
        ? el(serviceSelector2).text()
        : el(serviceSelector1).text();

      images.push({
        url: url,
        similarity: similarity,
        service: service
      });
    });

    return images;
  }
}
