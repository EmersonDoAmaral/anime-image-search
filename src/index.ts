require('dotenv').config();
import cheerio from 'cheerio';
import FormData from 'form-data';
import axios, { AxiosRequestConfig } from 'axios';

interface DefaultOptions {
  imgurKey?: string;
  saucenaoKey?: string;
  axios?: {
    headers?: {
      UserAgent?: string;
    };
  };
}

const dOptions: DefaultOptions = {
  axios: {
    headers: {
      UserAgent:
        'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:15.0) Gecko/20100101 Firefox/15.0.1'
    }
  }
};

export class Api {
  private options: DefaultOptions;
  private searchEngines: string[];
  private imgurBaseConfig: {
    url: string;
    headers: {
      Authorization?: string;
      UserAgent?: string;
    };
  };

  constructor(options: DefaultOptions) {
    this.options = { ...dOptions, ...options };

    this.searchEngines = [
      `https://saucenao.com/search.php?api_key=${this.options.saucenaoKey}&output_type=2&db=999&dmkasi=32768&url=`,
      'http://www.iqdb.org'
    ];

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
   * Receives a image url to search.
   *
   * @param imageUrl - A image url to search.
   * @param minSimilarity - The minimum similarity to return the images. Default: 80
   *
   * @returns Returns an object array containing the more similars images.
   */
  async saucenao(
    imageUrl: string,
    minSimilarity: number = 80
  ): Promise<object[]> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: this.searchEngines[0] + imageUrl
    };

    if (!this.options.saucenaoKey) {
      throw new Error(
        'To use saucenao search you need to use your own api key. Go to https://saucenao.com, register and get an api key.'
      );
    }
    const response = await axios(config).catch((err) => {
      if (err.response.status === 403) {
        throw new Error(`${err.response.statusText}, the api key is invalid.`);
      } else {
        throw new Error(`${err.response.status}. ${err.response.statusText}`);
      }
    });

    const similarImages: [] = response.data.results;

    const moreSimilar: object[] = similarImages.filter(
      (image: { header: { similarity: string } }) => {
        return parseInt(image.header.similarity) >= minSimilarity;
      }
    );

    return moreSimilar;
  }

  /**
   * Returns an object containing similars images.
   *
   * @param imageUrl - A image url to search
   *
   * @returns A array containing similars images from IQDB
   * @see https://iqdb.org
   */
  async iqdb(imageUrl: string): Promise<object[]> {
    const formData = new FormData();
    formData.append('url', imageUrl);

    const config: AxiosRequestConfig = {
      method: 'POST',
      url: this.searchEngines[1],
      headers: {
        ...formData.getHeaders()
      },
      data: formData
    };

    const request = await axios(config);
    const html = request.data;

    const $ = cheerio.load(html);

    const images: object[] = [];

    $('div.pages#pages div').each((_, e) => {
      const isYourImage = 'table > tbody > tr:nth-child(1)';
      const imageUrlSelector = 'td.image > a';
      const similaritySelector = 'table > tbody > tr:nth-child(5) > td';

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

      images.push({
        url: url,
        similarity: similarity
      });
    });

    return images;
  }
}
