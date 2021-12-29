require('dotenv').config();
import cheerio from 'cheerio';
import FormData from 'form-data';
import axios, { AxiosRequestConfig } from 'axios';
import { ReadStream, createReadStream } from 'fs';

interface DefaultOptions {
  imgurKey?: string;
  saucenaoKey?: string;
  axios?: {
    headers?: {
      UserAgent?: string;
    };
  };
}

interface SaucenaoOptions {
  api_key?: string;
  output_type?: number;
  dbmask?: number;
  dbmaski?: number;
  db?: number;
  numres?: number;
  hide?: number;
  min_similarity?: number;
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
  private imgurBaseConfig: {
    url: string;
    headers: {
      Authorization?: string;
      UserAgent?: string;
    };
  };

  constructor(options: DefaultOptions = {}) {
    this.options = { ...dOptions, ...options };

    this.searchEngines = ['https://saucenao.com', 'http://www.iqdb.org'];

    this.imgurBaseConfig = {
      url: 'https://api.imgur.com/3/image',
      headers: {
        Authorization: `Client-ID ${this.options.imgurKey}`,
        ...this.options.axios?.headers
      }
    };
  }
  /**
   * Receives a base64 image and uploads to imgur.
   *
   * @param file - The base64 string to upload.
   *
   * @returns Data from Imgur if success
   */
  async uploadToImgur(file: string): Promise<{
    id?: string;
    link?: string;
    deletehash?: string;
    status?: number;
    success?: boolean;
  }> {
    const config: AxiosRequestConfig = {
      method: 'post',
      data: {
        image: file,
        type: 'base64'
      },
      ...this.imgurBaseConfig
    };

    const request = await axios(config).catch((err) => {
      if (err.response.status === 401) {
        throw new Error(
          'You need an Imgur Client-ID to upload an image. Go to https://api.imgur.com/oauth2/addclient, register, get your Client-ID and pass to the constructor.'
        );
      } else if (err.response.status === 403) {
        throw new Error(err.response.data.data.error);
      } else {
        return err.response.data;
      }
    });

    const { status, data, success } = request?.data;

    if (!success) {
      return { status, success };
    }

    const { link, deletehash, id } = data;

    return { id, link, deletehash, status };
  }

  /**
   * Receives a delete hash, then try to delete the image from imgur.
   *
   * @param deletehash - The delete hash returned by uploadToImgur.
   *
   * @returns Data from Imgur.
   */
  async deleteImgurImage(deletehash: string): Promise<object> {
    const config: AxiosRequestConfig = {
      method: 'delete',
      ...this.imgurBaseConfig,
      url: this.imgurBaseConfig.url + `/${deletehash}`
    };

    const request = await axios(config);

    return request.data;
  }

  /**
   * Receives a image to search in saucenao.
   *
   * @param {string|Buffer|ReadStream} image - The image to search.
   * @param {SaucenaoOptions} options - Saucenao Options.
   * @param {string} options.api_key - Saucenao Api Key.
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
  ): Promise<object[]> {
    const opts = { ...saucenaoDefaultOptions, ...options };

    if (!opts.api_key) {
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
      if (err.response.status === 403) {
        throw new Error(`${err.response.statusText}, the api key is invalid.`);
      } else {
        throw new Error(`${err.response.status}. ${err.response.statusText}`);
      }
    });

    const results = response.data.results.filter(
      (item: { header: { similarity: string } }) => {
        return parseFloat(item.header.similarity) >= opts.min_similarity!;
      }
    );

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
